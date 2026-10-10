const test = require("node:test");
const assert = require("node:assert/strict");
const { Types } = require("mongoose");
const service = require("./cita.service");
const controller = require("../controllers/cita.controller");
const citaRepository = require("../repositories/cita.repository");
const userRepository = require("../repositories/user.repository");
const servicioRepository = require("../repositories/servicio.repository");
const inventarioRepository = require("../repositories/inventario.repository");
const patientRepository = require("../repositories/patientIdentity.repository");

const id = (number) => number.toString(16).padStart(24, "0");
const actor = { id: id(11), rol: "cosmiatra" };
const booking = () => ({
  cliente: "Camila Pérez", rol: "doctor", profesional: id(10), servicio: [],
  fecha: "2026-10-20T15:00:00.000Z",
});
const sourceAppointment = (overrides = {}) => ({
  _id: new Types.ObjectId(id(20)), pacienteId: new Types.ObjectId(id(30)),
  cliente: "Camila Pérez", profesional: new Types.ObjectId(id(10)), rol: "doctor",
  ...overrides,
});

function mockRepositories(t, { source = sourceAppointment() } = {}) {
  const targets = [citaRepository, userRepository, servicioRepository, inventarioRepository, patientRepository];
  const originals = targets.map((target) => ({ ...target }));
  t.after(() => targets.forEach((target, index) => Object.assign(target, originals[index])));
  const created = [];
  const sourceReads = [];
  const patientReads = [];
  citaRepository.findById = async (citaId) => {
    sourceReads.push(citaId);
    return source;
  };
  citaRepository.findByIdempotencyKey = async () => null;
  citaRepository.create = async (data) => {
    const record = { _id: id(99), ...data };
    created.push(record);
    return record;
  };
  citaRepository.findByIdPopulated = async () => created[0];
  userRepository.findById = async (professionalId) => ({ _id: professionalId, rol: "doctor" });
  servicioRepository.findByRolAndNombres = async () => [];
  inventarioRepository.findByRolAndTipo = async () => [];
  patientRepository.findCandidates = async (query) => {
    patientReads.push(query);
    return { citas: [], tratamientos: [], historias: [], pagos: [] };
  };
  return { created, sourceReads, patientReads };
}

test("patient suggestions retain persisted appointment references and keep stable homonyms separate", async (t) => {
  mockRepositories(t);
  citaRepository.searchByClientName = async () => [
    sourceAppointment(),
    sourceAppointment({ _id: id(21), cliente: "Camila Perez" }),
    sourceAppointment({ _id: id(22), pacienteId: id(31) }),
    { _id: id(23), cliente: "  María   López " },
    { _id: id(24), cliente: "maria lopez" },
    { _id: id(25), cliente: "Camila Pérez" },
    { _id: id(26), cliente: "Otro cliente", pacienteId: "invalid" },
  ];

  assert.deepEqual(await service.buscarPacientes("Ca", actor), [
    { nombre: "Camila Pérez", citaPacienteId: id(20) },
    { nombre: "Camila Pérez", citaPacienteId: id(22) },
    { nombre: "María   López" },
    { nombre: "Camila Pérez" },
    { nombre: "Otro cliente" },
  ]);
});

test("patient suggestions keep the existing limit and search visibility", async (t) => {
  mockRepositories(t);
  const doctor = { id: id(10), rol: "doctor" };
  let query;
  citaRepository.searchByClientName = async () => assert.fail("doctor search must stay scoped");
  citaRepository.searchByClientNameAndProfesional = async (...args) => {
    query = args;
    return Array.from({ length: 12 }, (_, index) => sourceAppointment({
      _id: id(100 + index), pacienteId: id(200 + index), cliente: `Cliente ${index}`,
    }));
  };

  assert.equal((await service.buscarPacientes(" C(a) ", doctor)).length, 10);
  assert.deepEqual(query, ["C\\(a\\)", doctor.id]);
  assert.deepEqual(await service.buscarPacientes("   ", doctor), []);
});

test("a selected existing patient reuses only the persisted identity and canonical name", async (t) => {
  const { created, sourceReads, patientReads } = mockRepositories(t);
  const result = await service.crearCita({
    ...booking(), cliente: "  camila   perez  ", citaPacienteId: id(20), pacienteId: id(777),
  }, actor);

  assert.equal(result.creada, true);
  assert.deepEqual(sourceReads, [id(20)]);
  assert.deepEqual(patientReads, []);
  assert.equal(created[0].pacienteId, id(30));
  assert.equal(created[0].cliente, "Camila Pérez");
  assert.equal(created[0].profesional, id(10));
});

test("a legacy name-only booking remains unverified and ignores a browser patient id", async (t) => {
  const { created, sourceReads, patientReads } = mockRepositories(t);
  await service.crearCita({ ...booking(), pacienteId: id(777) }, actor);

  assert.deepEqual(sourceReads, []);
  assert.deepEqual(patientReads, [{ names: ["Camila Pérez"] }]);
  assert.equal(created[0].pacienteId, undefined);
});

for (const invalidId of [null, "", "invalid", {}, id(20).slice(1)]) {
  test(`an invalid selected appointment id is rejected: ${JSON.stringify(invalidId)}`, async (t) => {
    const { created, sourceReads } = mockRepositories(t);
    await assert.rejects(service.crearCita({ ...booking(), citaPacienteId: invalidId }, actor),
      (error) => error.statusCode === 400);
    assert.deepEqual(sourceReads, []);
    assert.deepEqual(created, []);
  });
}

test("a deleted selected appointment is rejected before registration", async (t) => {
  const { created } = mockRepositories(t, { source: null });
  await assert.rejects(service.crearCita({ ...booking(), citaPacienteId: id(20) }, actor),
    (error) => error.statusCode === 404);
  assert.deepEqual(created, []);
});

test("an appointment without a stable patient identity cannot identify a returning patient", async (t) => {
  const { created } = mockRepositories(t, { source: sourceAppointment({ pacienteId: undefined }) });
  await assert.rejects(service.crearCita({ ...booking(), citaPacienteId: id(20) }, actor),
    (error) => error.statusCode === 409);
  assert.deepEqual(created, []);
});

test("a renamed patient invalidates a stale suggestion without creating a booking", async (t) => {
  const { created } = mockRepositories(t, { source: sourceAppointment({ cliente: "Camila Pérez Hidalgo" }) });
  await assert.rejects(service.crearCita({ ...booking(), citaPacienteId: id(20) }, actor),
    (error) => error.statusCode === 409 && /nombre.*cambió/.test(error.message));
  assert.deepEqual(created, []);
});

test("doctors may reuse a patient only through appointments they can manage", async (t) => {
  const { created } = mockRepositories(t);
  await assert.rejects(service.crearCita({ ...booking(), profesional: id(12), citaPacienteId: id(20) },
    { id: id(12), rol: "doctor" }), (error) => error.statusCode === 403);
  assert.deepEqual(created, []);
});

test("a doctor can reuse a patient from an owned appointment with a populated professional", async (t) => {
  const { created } = mockRepositories(t, {
    source: sourceAppointment({ profesional: { _id: new Types.ObjectId(id(10)) } }),
  });
  await service.crearCita({ ...booking(), citaPacienteId: id(20) }, { id: id(10), rol: "doctor" });
  assert.equal(created[0].pacienteId, id(30));
});

test("idempotent retries still return the saved booking after a patient's name changes", async (t) => {
  const { created, sourceReads } = mockRepositories(t);
  const saved = { _id: id(40), profesional: id(10), cliente: "Camila Pérez Hidalgo", pacienteId: id(30) };
  citaRepository.findByIdempotencyKey = async () => saved;
  citaRepository.findByIdPopulated = async () => saved;
  const result = await service.crearCita({ ...booking(), citaPacienteId: id(20), idempotencyKey: "booking-1" }, actor);
  assert.deepEqual(result, { cita: saved, creada: false });
  assert.deepEqual(sourceReads, []);
  assert.deepEqual(created, []);
});

test("the HTTP controller forwards the appointment reference without trusting a browser patient id", async (t) => {
  const original = service.crearCita;
  t.after(() => { service.crearCita = original; });
  let forwarded;
  service.crearCita = async (data, currentActor) => {
    forwarded = { data, currentActor };
    return { cita: { _id: id(99) }, creada: false };
  };
  const body = { ...booking(), citaPacienteId: id(20), pacienteId: id(777) };
  await new Promise((resolve, reject) => {
    const response = {
      status(code) { assert.equal(code, 200); return this; },
      json(data) { resolve(data); },
    };
    controller.crearCita({ body, user: actor }, response, reject);
  });
  assert.deepEqual(forwarded, {
    data: { ...booking(), idempotencyKey: undefined, citaPacienteId: id(20) }, currentActor: actor,
  });
});
