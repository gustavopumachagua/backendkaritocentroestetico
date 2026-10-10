const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveStoredAsset, parseLegacyCloudinaryUrl, assetFromUpload, mediaVersion } = require("./mediaAsset");
const { presentMedia } = require("./mediaPresentation");

const options = { folder: "firmas", cloudName: "account-test" };
const url = "https://res.cloudinary.com/account-test/image/upload/v123/firmas/example.webp";
test("legacy resolution binds the expected cloud, folder, image format and public id", () => {
  const asset = resolveStoredAsset({ ...options, url, publicId: "firmas/example" });
  assert.equal(asset.type, "upload");
  assert.equal(asset.version, 123);
  for (const unsafe of [url.replace("account-test", "other-cloud"), url.replace("https:", "http:"), url.replace("res.cloudinary.com", "evil.test"), url.replace("firmas", "avatars"), `${url}?signature=abc`, `${url}#fragment`, url.replace("example.webp", "../example.webp")]) {
    assert.equal(parseLegacyCloudinaryUrl(unsafe, options), null);
  }
  assert.equal(resolveStoredAsset({ ...options, url, publicId: "firmas/different" }), null);
});

test("authenticated metadata is authoritative after an existing URL becomes stale", () => {
  const metadata = assetFromUpload({ asset_id: "stable", public_id: "firmas/example", type: "authenticated", format: "webp", version: 789 });
  assert.equal(resolveStoredAsset({ ...options, asset: metadata, url }).type, "authenticated");
});

test("response presentation preserves clinical prose and replaces each media reference", () => {
  const record = {
    _id: "doctor-1", firmaDigital: url, firmaDigitalPublicId: "firmas/example",
    firmaDigitalAsset: { public_id: "firmas/example", version: 9 },
    avatar: url.replace("firmas", "avatars"), avatarPublicId: "avatars/example",
    datosFormulario: { comentario: url, descripcion: "Texto clínico sin modificación" },
  };
  const safe = presentMedia(record);
  assert.equal(safe.firmaDigital, `/api/media/signatures/doctor-1?v=${mediaVersion(record.firmaDigitalAsset)}`);
  assert.equal(safe.avatar, "/api/media/avatars/doctor-1?v=0");
  assert.deepEqual(safe.datosFormulario, record.datosFormulario);
  assert.equal(safe.firmaDigitalPublicId, undefined);
  assert.equal(safe.firmaDigitalAsset, undefined);
  assert.deepEqual(presentMedia(safe), safe);
});

test("history and treatment presentation retain associations but never emit upstream metadata", () => {
  const treatment = presentMedia({ _id: "treatment-1", imagenes: [{ _id: "image-1", url, thumbnailUrl: url, public_id: "tratamientos/example", asset: { public_id: "tratamientos/example", version: 5 } }] });
  assert.match(treatment.imagenes[0].url, /^\/api\/media\/treatments\/treatment-1\/images\/image-1\?v=\d{1,16}$/);
  assert.equal(treatment.imagenes[0].thumbnailUrl, treatment.imagenes[0].url);
  assert.equal(treatment.imagenes[0].asset, undefined);
  assert.equal(treatment.imagenes[0].public_id, undefined);
  const history = presentMedia({ _id: "history-1", firmaMedico: { nombre: "Doctor", url, asset: { version: 7 } }, signatureUrl: url });
  assert.equal(history.signatureUrl, "/api/media/histories/history-1/signature?v=7");
  assert.equal(history.firmaMedico.url, history.signatureUrl);
  assert.equal(JSON.stringify(history).includes("cloudinary.com"), false);
});

test("legacy treatment images without stored ids get an index reference", () => {
  const treatment = presentMedia({ _id: "treatment", imagenes: [{ url }] });
  assert.equal(treatment.imagenes[0].url, "/api/media/treatments/treatment/images/0?v=0");
});

test("two replacements in the same second have distinct opaque versions", () => {
  const first = { asset_id: "first-asset", version: 123 };
  const second = { asset_id: "second-asset", version: 123 };
  assert.notEqual(mediaVersion(first), mediaVersion(second));
  assert.match(mediaVersion(first), /^\d{1,16}$/);
  const record = { id: "doctor-1", firmaDigital: `/api/media/signatures/doctor-1?v=${mediaVersion(first)}` };
  assert.equal(presentMedia(record).firmaDigital, record.firmaDigital);
  assert.equal(presentMedia({ ...record, firmaDigital: "/api/media/signatures/foreign?v=999" }).firmaDigital, "/api/media/signatures/doctor-1?v=0");
});
