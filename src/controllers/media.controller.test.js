const test = require("node:test");
const assert = require("node:assert/strict");
const controller = require("./media.controller");
const mediaService = require("../services/media.service");
const routes = require("../routes/media.routes");
const authJwt = require("../middlewares/authJwt");
const { mediaReadRateLimiter } = require("../middlewares/rateLimit");

test("every binary route passes JWT and per-account rate limiting before delivery", () => {
  assert.equal(routes.stack[0].handle, authJwt);
  assert.equal(routes.stack[1].handle, mediaReadRateLimiter);
  assert.deepEqual(routes.stack.filter((layer) => layer.route).map((layer) => layer.route.path), ["/avatars/:userId", "/signatures/:userId", "/histories/:historyId/signature", "/treatments/:treatmentId/images/:imageId"]);
});

test("protected images are delivered as no-store bytes with no ETag or redirect", async (t) => {
  const original = mediaService.signature;
  t.after(() => { mediaService.signature = original; });
  const bytes = Buffer.from("image");
  mediaService.signature = async () => ({ bytes, contentType: "image/webp" });
  const headers = {};
  await new Promise((resolve, reject) => {
    const res = {
      set(values) { Object.assign(headers, values); return this; },
      vary(field) { headers.Vary = field; return this; },
      status(code) { assert.equal(code, 200); return this; },
      end(body) { assert.equal(body, bytes); resolve(); },
      redirect() { assert.fail("must not redirect"); },
      json() { assert.fail("must not publish a URL"); },
    };
    controller.signature({ params: { userId: "own" }, user: { id: "own", rol: "doctor" } }, res, reject);
  });
  assert.equal(headers["Cache-Control"], "private, no-store, max-age=0");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers.Vary, "Authorization");
  assert.equal(headers["Content-Type"], "image/webp");
  assert.equal(headers.ETag, undefined);
  assert.equal(headers.Location, undefined);
});
