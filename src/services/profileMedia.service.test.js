const test = require("node:test");
const assert = require("node:assert/strict");
const { createProfileMediaService } = require("./profileMedia.service");
const cloudinary = require("../config/cloudinary");
const mediaAdapter = require("./cloudinaryMedia.adapter");
const { mediaVersion } = require("../helpers/mediaAsset");
const USER = "507f1f77bcf86cd799439011";
const actor = { id: USER, rol: "doctor" };
const oldAsset = { public_id: "firmas/previous", resource_type: "image", type: "upload", format: "webp", version: 1 };

function fixture({ saveError = null } = {}) {
  const calls = [];
  const user = { _id: USER, rol: "doctor", firmaDigitalAsset: oldAsset, firmaDigital: "old-url", firmaDigitalPublicId: oldAsset.public_id };
  const service = createProfileMediaService({
    users: { findById: async () => user, save: async () => { calls.push("save"); if (saveError) throw saveError; } },
    histories: { sincronizarDatosMedicoEnHistorias: async (value) => { calls.push("history"); assert.equal(value.firmaDigitalAsset.type, "authenticated"); } },
    adapter: { uploadImage: async (file, options) => { calls.push(options.folder); return { ...oldAsset, public_id: `${options.folder}/replacement`, type: "authenticated", version: 99 }; } },
    validate: async () => calls.push("validate"),
    clean: () => calls.push("clean"),
  });
  return { service, user, calls };
}

test("signature replacement stores stable protected metadata, synchronizes history, and retains prior assets", async () => {
  const { service, user, calls } = fixture();
  const response = await service.uploadProfileImage({ path: "temp-file" }, actor, "signature");
  assert.equal(response.url, `/api/media/signatures/${USER}?v=${mediaVersion(user.firmaDigitalAsset)}`);
  assert.equal(user.firmaDigitalAsset.type, "authenticated");
  assert.deepEqual(calls, ["validate", "firmas", "save", "history", "clean"]);
  assert.equal(oldAsset.public_id, "firmas/previous");
  assert.equal(user.retiredMediaAssets.length, 1);
  assert.equal(user.retiredMediaAssets[0].asset.public_id, oldAsset.public_id);
  assert.equal(user.retiredMediaAssets[0].kind, "signature");
  assert.equal(JSON.stringify(response).includes("public_id"), false);
});

test("failed persistence cleans local temporary files without destroying either Cloudinary asset", async () => {
  const { service, calls } = fixture({ saveError: new Error("db-failure") });
  await assert.rejects(() => service.uploadProfileImage({ path: "temp-file" }, actor, "signature"), /db-failure/);
  assert.deepEqual(calls, ["validate", "firmas", "save", "clean"]);
});

test("legacy public images keep an owner-bound archive before replacement", async () => {
  const user = { _id: USER, rol: "doctor", avatar: "https://res.cloudinary.com/test-cloud/image/upload/v1/avatars/old.webp", avatarPublicId: "avatars/old", retiredMediaAssets: [] };
  let stored;
  const service = createProfileMediaService({
    users: { findById: async (id, fields) => { assert.equal(fields, "+retiredMediaAssets"); return user; }, save: async (value) => { stored = value; } },
    adapter: { uploadImage: async () => ({ public_id: "avatars/new", asset_id: "new-id", type: "authenticated", resource_type: "image", format: "webp", version: 2 }) },
    validate: async () => {}, clean: () => {}, cloudName: () => "test-cloud",
  });
  await service.uploadProfileImage({ path: "temp-file" }, actor, "avatar");
  assert.equal(stored.avatarAsset.type, "authenticated");
  assert.equal(stored.retiredMediaAssets[0].asset.type, "upload");
  assert.equal(stored.retiredMediaAssets[0].asset.public_id, "avatars/old");
  assert.equal(stored.retiredMediaAssets[0].url.includes("cloudinary.com"), true);
  const { presentMedia } = require("../helpers/mediaPresentation");
  assert.equal(presentMedia(stored).retiredMediaAssets, undefined);
});

test("non-doctors cannot upload signatures and no upload happens", async () => {
  const { service, calls } = fixture();
  await assert.rejects(() => service.uploadProfileImage({ path: "temp-file" }, { id: USER, rol: "cosmiatra" }, "signature"), (error) => error.statusCode === 403);
  assert.deepEqual(calls, ["clean"]);
});

test("all new upload types use authenticated delivery and do not publish secure_url", async (t) => {
  const original = cloudinary.uploader.upload;
  t.after(() => { cloudinary.uploader.upload = original; });
  const calls = [];
  cloudinary.uploader.upload = async (path, options) => {
    calls.push(options);
    return { asset_id: "stable", public_id: `${options.folder}/example`, resource_type: "image", type: options.type, format: "webp", version: 2, secure_url: "https://sensitive.example.test/private-image" };
  };
  for (const folder of ["firmas", "avatars", "tratamientos"]) {
    const asset = await mediaAdapter.uploadImage({ path: "temp-file" }, { folder, transformation: [] });
    assert.equal(asset.type, "authenticated");
    assert.equal(asset.secure_url, undefined);
  }
  assert.ok(calls.every((options) => options.resource_type === "image" && options.type === "authenticated"));
});

test("provider upload responses must confirm authenticated delivery before persistence", async (t) => {
  const original = cloudinary.uploader.upload;
  t.after(() => { cloudinary.uploader.upload = original; });
  for (const unexpected of [{ type: "upload", resource_type: "image" }, { type: "authenticated", resource_type: "video" }, { type: "authenticated" }]) {
    cloudinary.uploader.upload = async () => ({ public_id: "firmas/example", format: "webp", version: 1, ...unexpected });
    await assert.rejects(() => mediaAdapter.uploadImage({ path: "temp-file" }, { folder: "firmas", transformation: [] }), (error) => error.statusCode === 502);
  }
});
