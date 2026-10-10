const test = require("node:test");
const assert = require("node:assert/strict");
const { createMediaService } = require("./media.service");
const USER = "507f1f77bcf86cd799439011";
const FOREIGN = "507f1f77bcf86cd799439012";
const HISTORY = "507f1f77bcf86cd799439013";
const TREATMENT = "507f1f77bcf86cd799439014";
const IMAGE = "507f1f77bcf86cd799439015";
const asset = (folder) => ({ public_id: `${folder}/example`, type: "authenticated", resource_type: "image", format: "webp", version: 1 });
const doctor = { id: USER, rol: "doctor", nombre: "Shared name" };

function fixture(overrides = {}) {
  const downloads = [];
  const service = createMediaService({
    users: { findById: async () => ({ _id: USER, rol: "doctor", activo: true, firmaDigitalAsset: asset("firmas"), avatarAsset: asset("avatars") }) },
    histories: { findById: async () => ({ _id: HISTORY, medico: USER }) },
    treatments: { findById: async () => ({ _id: TREATMENT, profesionalId: USER, rol: "doctor", imagenes: [{ _id: IMAGE, asset: asset("tratamientos") }] }) },
    appointments: { findById: async () => ({ profesional: USER, rol: "doctor" }) },
    adapter: { downloadImage: async (value) => { downloads.push(value); return { bytes: Buffer.from("image"), contentType: "image/webp" }; } },
    cloudName: () => "test-cloud", ...overrides,
  });
  return { service, downloads };
}

test("a doctor can fetch their signature and their history signature", async () => {
  const { service, downloads } = fixture();
  await service.signature(USER, doctor);
  await service.historySignature(HISTORY, doctor);
  assert.equal(downloads.length, 2);
  assert.ok(downloads.every((item) => item.type === "authenticated"));
});

test("foreign signatures and histories are rejected before provider access", async () => {
  const { service, downloads } = fixture({ histories: { findById: async () => ({ medico: FOREIGN }) } });
  for (const operation of [() => service.signature(FOREIGN, doctor), () => service.signature(USER, { id: FOREIGN, rol: "administrador" }), () => service.historySignature(HISTORY, doctor)]) {
    await assert.rejects(operation, (error) => error.statusCode === 403);
  }
  assert.equal(downloads.length, 0);
});

test("avatars are available only to authenticated staff and active target accounts", async () => {
  const { service } = fixture();
  await service.avatar(USER, { id: FOREIGN, rol: "cosmiatra" });
  await assert.rejects(() => service.avatar(USER, { id: FOREIGN, rol: "visitor" }), (error) => error.statusCode === 403);
  const disabled = fixture({ users: { findById: async () => ({ activo: false }) } }).service;
  await assert.rejects(() => disabled.avatar(USER, doctor), (error) => error.statusCode === 404);
});

test("treatment photos belong to the immutable professional or administration", async () => {
  const { service } = fixture();
  await service.treatmentImage(TREATMENT, IMAGE, doctor);
  await service.treatmentImage(TREATMENT, IMAGE, { id: FOREIGN, rol: "administrador" });
  await assert.rejects(() => service.treatmentImage(TREATMENT, IMAGE, { ...doctor, id: FOREIGN }), (error) => error.statusCode === 403);
});

test("a same-name appointment never overrides a conflicting immutable owner", async () => {
  const { service, downloads } = fixture({ treatments: { findById: async () => ({ profesionalId: FOREIGN, profesional: doctor.nombre, cita: HISTORY, rol: "doctor", imagenes: [{ _id: IMAGE, asset: asset("tratamientos") }] }) } });
  await assert.rejects(() => service.treatmentImage(TREATMENT, IMAGE, doctor), (error) => error.statusCode === 403);
  assert.equal(downloads.length, 0);
});

test("unowned legacy treatment needs an owned appointment, and supports stable index images", async () => {
  const { service } = fixture({ treatments: { findById: async () => ({ cita: HISTORY, imagenes: [{ asset: asset("tratamientos") }] }) } });
  await service.treatmentImage(TREATMENT, "0", doctor);
  const foreign = fixture({ treatments: { findById: async () => ({ profesional: doctor.nombre, imagenes: [{ _id: IMAGE, asset: asset("tratamientos") }] }) } }).service;
  await assert.rejects(() => foreign.treatmentImage(TREATMENT, IMAGE, doctor), (error) => error.statusCode === 403);
});

test("URLs from a different cloud cannot turn the backend into a proxy", async () => {
  const { service, downloads } = fixture({ users: { findById: async () => ({ rol: "doctor", firmaDigital: "https://res.cloudinary.com/foreign/image/upload/v1/firmas/example.webp" }) } });
  await assert.rejects(() => service.signature(USER, doctor), (error) => error.statusCode === 404);
  assert.equal(downloads.length, 0);
});
