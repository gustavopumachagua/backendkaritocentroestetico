const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { assertDownloadUrl, fetchImage, downloadImage, MAX_IMAGE_BYTES } = require("./cloudinaryMedia.adapter");
const cloudinary = require("../config/cloudinary");
const upstream = "https://api.cloudinary.com/v1_1/cloud-test/image/download?public_id=firmas%2Ftest&signature=secret";

test("download allow-list blocks foreign hosts, arbitrary paths, plaintext, ports, and credentials", () => {
  assert.equal(assertDownloadUrl(upstream, "cloud-test").hostname, "api.cloudinary.com");
  for (const unsafe of ["not-a-url?signature=secret", upstream.replace("api.cloudinary.com", "evil.test"), upstream.replace("https:", "http:"), upstream.replace("cloud-test", "other"), upstream.replace("/download", "/upload"), upstream.replace("api.cloudinary.com", "api.cloudinary.com:444"), upstream.replace("api.cloudinary.com", "user:password@api.cloudinary.com")]) {
    assert.throws(() => assertDownloadUrl(unsafe, "cloud-test"), (error) => error.statusCode === 502 && !error.message.includes("secret"));
  }
});

function fakeGet({ status = 200, type = "image/webp", size, chunks = [Buffer.from("RIFF0000WEBPimage")] } = {}) {
  return (url, options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => request;
    request.destroy = () => { request.destroyed = true; };
    queueMicrotask(() => {
      const response = new EventEmitter();
      response.statusCode = status;
      response.complete = true;
      response.headers = { "content-type": type, ...(size ? { "content-length": size } : {}) };
      response.destroy = () => { response.destroyed = true; };
      callback(response);
      if (response.destroyed) return;
      for (const chunk of chunks) response.emit("data", chunk);
      if (!response.destroyed) response.emit("end");
    });
    return request;
  };
}

test("binary proxy accepts bounded image bytes without redirecting the browser", async () => {
  const image = await fetchImage(upstream, "cloud-test", fakeGet());
  assert.equal(image.contentType, "image/webp");
  assert.ok(Buffer.isBuffer(image.bytes));
  assert.equal(image.url, undefined);
});

test("binary proxy rejects redirects, HTML, declared oversize and streamed oversize", async () => {
  for (const options of [{ status: 302 }, { type: "text/html" }, { chunks: [Buffer.from("<html>spoofed MIME</html>")] }, { size: MAX_IMAGE_BYTES + 1 }, { chunks: [Buffer.alloc(MAX_IMAGE_BYTES + 1)] }, { chunks: [] }]) {
    await assert.rejects(() => fetchImage(upstream, "cloud-test", fakeGet(options)), (error) => error.statusCode === 502 && !error.message.includes("signature="));
  }
});

test("provider links expire in sixty seconds and remain inside the backend", async (t) => {
  const original = cloudinary.utils.private_download_url;
  t.after(() => { cloudinary.utils.private_download_url = original; });
  const calls = [];
  cloudinary.utils.private_download_url = (id, format, options) => { calls.push({ id, format, options }); return upstream; };
  const output = await downloadImage({ public_id: "firmas/example", format: "webp", type: "authenticated" }, { now: () => 100000, download: async () => ({ bytes: Buffer.from("image"), contentType: "image/webp" }) });
  assert.equal(calls[0].options.expires_at, 160);
  assert.equal(calls[0].options.attachment, false);
  assert.equal(calls[0].options.type, "authenticated");
  assert.equal(output.url, undefined);
});

test("interrupted migration retries only the same upload asset after upstream 404", async (t) => {
  const original = cloudinary.utils.private_download_url;
  t.after(() => { cloudinary.utils.private_download_url = original; });
  const types = [];
  cloudinary.utils.private_download_url = (id, format, options) => { types.push(options.type); return upstream; };
  let downloads = 0;
  await downloadImage({ public_id: "firmas/example", format: "webp", type: "upload" }, { download: async () => { downloads += 1; if (downloads === 1) throw Object.assign(new Error("upstream"), { upstreamStatus: 404 }); return { bytes: Buffer.from("image"), contentType: "image/webp" }; } });
  assert.deepEqual(types, ["upload", "authenticated"]);
  types.length = 0;
  await assert.rejects(() => downloadImage({ public_id: "firmas/example", format: "webp", type: "upload" }, { download: async () => { throw Object.assign(new Error("upstream"), { upstreamStatus: 403 }); } }));
  assert.deepEqual(types, ["upload"]);
});
