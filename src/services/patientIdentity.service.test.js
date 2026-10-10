const test = require("node:test");
const assert = require("node:assert/strict");
const { Types } = require("mongoose");
const service = require("./patientIdentity.service");
const repository = require("../repositories/patientIdentity.repository");
const { getId } = require("../helpers/patientIdentity");

const id = (number) => number.toString(16).padStart(24, "0");
const readPath = (record, path) => path.split(".").reduce((value, key) => value?.[key], record);
function writePath(record, path, value) {
  const keys = path.split(".");
  const field = keys.pop();
  const parent = keys.reduce((value, key) => value[key] ||= {}, record);
  if (value === undefined) delete parent[field];
  else parent[field] = structuredClone(value);
}

function mockRepository(t, records, { failAt = Infinity } = {}) {
  const original = { ...repository };
  const mutations = [];
  const restored = [];
  const types = { cita: "citas", tratamiento: "tratamientos", historia: "historias", pago: "pagos" };
  t.after(() => Object.assign(repository, original));
  repository.findCandidates = async () => structuredClone(records);
  repository.applyMutation = async (operation) => {
    const record = records[types[operation.type]].find((value) => getId(value) === operation.id);
    const expected = { ...operation.previous, ...operation.guard };
    assert.ok(Object.entries(expected).every(([path, value]) =>
      JSON.stringify(readPath(record, path)) === JSON.stringify(value)), "must guard persisted identity evidence");
    if (mutations.length === failAt) throw new Error("persistence failed");
    mutations.push(operation);
    for (const [path, value] of Object.entries(operation.next)) writePath(record, path, value);
    return structuredClone(record);
  };
  repository.restoreMutation = async (operation) => {
    const record = records[types[operation.type]].find((value) => getId(value) === operation.id);
    restored.push(operation);
    for (const [path, value] of Object.entries(operation.previous)) writePath(record, path, value);
    return { modifiedCount: 1 };
  };
  return { mutations, restored };
}

function fixture() {
  const treatment = { _id: id(1), nombre: "Camila", celular: "987654321", sexo: "Femenino", cita: id(2), profesionalId: id(10) };
  const cita = { _id: id(2), cliente: "Camila", profesional: id(10) };
  const records = {
    tratamientos: [treatment, { ...treatment, _id: id(3), cita: id(4), profesionalId: id(11) },
      { ...treatment, _id: id(90), celular: "912345678", cita: id(91) }],
    citas: [cita, { _id: id(4), cliente: "Camila", profesional: id(11) }, { _id: id(91), cliente: "Camila", profesional: id(12) }],
    pagos: [{ _id: id(5), cita: id(2), cliente: "Camila", total: 80 }, { _id: id(6), cita: id(4), cliente: "Camila", total: 100 }],
    historias: [{ _id: id(7), tratamiento: id(3), cita: id(4), medico: id(11), estado: "finalizada",
      paciente: { nombre: "Camila", celular: "987654321", sexo: "Femenino" },
      datosFormulario: { nombreCompleto: "Camila", diagnostico: "Keep clinical answers" } }],
  };
  return { treatment, cita, records };
}

test("a correction updates visits, both professional roles, billing and existing PDFs without creating records", async (t) => {
  const data = fixture();
  const beforeCounts = Object.values(data.records).map((records) => records.length);
  const { mutations } = mockRepository(t, data.records);
  const result = await service.synchronizePatientName({
    identity: { tratamiento: data.treatment, cita: data.cita, patientName: "Camila" },
    nombreNuevo: "Camila Pérez", formData: { dni: "12345678" },
  });
  assert.equal(result.pacienteId, id(1));
  assert.equal(result.excludedAppointmentsCount, 1);
  assert.deepEqual(Object.values(data.records).map((records) => records.length), beforeCounts);
  assert.deepEqual(result.professionalIds.sort(), [id(10), id(11)]);
  assert.equal(mutations.length, 7);
  for (const record of [data.records.tratamientos[0], data.records.tratamientos[1]]) {
    assert.equal(record.nombre, "Camila Pérez");
    assert.equal(record.pacienteId, id(1));
    assert.deepEqual(record.pacienteNombresAnteriores, ["Camila"]);
  }
  assert.equal(data.records.tratamientos[2].nombre, "Camila");
  assert.equal(data.records.citas[2].cliente, "Camila");
  assert.ok(data.records.pagos.every((pago) => pago.cliente === "Camila Pérez" && pago.pacienteId === id(1)));
  assert.equal(data.records.pagos[0].total, 80);
  assert.equal(data.records.historias[0].estado, "finalizada");
  assert.equal(data.records.historias[0].datosFormulario.nombreCompleto, "Camila Pérez");
  assert.equal(data.records.historias[0].datosFormulario.diagnostico, "Keep clinical answers");
});

test("a failed write compensates every earlier mutation", async (t) => {
  const data = fixture();
  const before = structuredClone(data.records);
  const { restored } = mockRepository(t, data.records, { failAt: 4 });
  await assert.rejects(service.synchronizePatientName({
    identity: { tratamiento: data.treatment, cita: data.cita, patientName: "Camila" }, nombreNuevo: "Camila Pérez",
  }), /persistence failed/);
  assert.equal(restored.length, 4);
  assert.deepEqual(data.records, before);
});

test("conflicting immutable patient IDs are rejected before any write", async (t) => {
  const data = fixture();
  data.cita.pacienteId = new Types.ObjectId(id(20));
  data.treatment.pacienteId = new Types.ObjectId(id(21));
  const { mutations } = mockRepository(t, data.records);
  await assert.rejects(service.synchronizePatientName({
    identity: { tratamiento: data.treatment, cita: data.cita }, nombreNuevo: "Camila Pérez",
  }), (error) => error.statusCode === 409);
  assert.equal(mutations.length, 0);
});

test("name-only booking never creates a separate patient identity", async (t) => {
  const data = fixture();
  mockRepository(t, data.records);
  const result = await service.resolvePatientForRegistration({ nombre: "Camila" });
  assert.equal(result.pacienteId, undefined);
});

test("returning treatments reuse the same patient through verified old-name aliases", async (t) => {
  const data = fixture();
  data.records.tratamientos = [{ ...data.treatment, pacienteId: id(20), nombre: "Camila Pérez", pacienteNombresAnteriores: ["Camila"] }];
  data.records.historias = [];
  mockRepository(t, data.records);
  const result = await service.resolvePatientForRegistration({ nombre: "Camila", celular: "+51 987654321", sexo: "femenino" });
  assert.deepEqual(result, { pacienteId: id(20), nombre: "Camila Pérez" });
  const trusted = await service.resolvePatientForRegistration({ nombre: "Old display", cita: { pacienteId: new Types.ObjectId(id(20)), cliente: "Camila Pérez" } });
  assert.equal(trusted.pacienteId, id(20));
});

test("conflicting contact does not reuse a homonymous patient's immutable ID", async (t) => {
  const data = fixture();
  data.treatment.pacienteId = id(20);
  mockRepository(t, data.records);
  const result = await service.resolvePatientForRegistration({ nombre: "Camila", celular: "912222222", sexo: "femenino" });
  assert.notEqual(result.pacienteId, id(20));
});

test("an unrelated homonym does not force a duplicate of the verified returning patient", async (t) => {
  const data = fixture();
  data.treatment.pacienteId = id(20);
  data.records.tratamientos[2].pacienteId = id(90);
  mockRepository(t, data.records);
  const result = await service.resolvePatientForRegistration({ nombre: "Camila", celular: "987654321", sexo: "femenino" });
  assert.equal(result.pacienteId, id(20));
});

test("ambiguous persisted identities require verification instead of inventing another client", async (t) => {
  const data = fixture();
  data.records.tratamientos[0].pacienteId = id(20);
  data.records.tratamientos[1].pacienteId = id(21);
  mockRepository(t, data.records);
  await assert.rejects(service.resolvePatientForRegistration({ nombre: "Camila", celular: "987654321", sexo: "femenino" }),
    (error) => error.statusCode === 409);
});

test("a reviewed old-name repair has a read-only plan and still requires verified contact", async (t) => {
  const data = fixture();
  data.treatment.nombre = "Camila Pérez";
  const { mutations } = mockRepository(t, data.records);
  const input = { identity: { tratamiento: data.treatment, cita: data.cita, patientName: "Camila Pérez" },
    nombreNuevo: "Camila Pérez", approvedPreviousNames: ["Camila"] };
  await assert.rejects(service.synchronizePatientName(input), (error) => error.statusCode === 400);
  const plan = await service.synchronizePatientName({ ...input, allowLegacyAliasMigration: true, dryRun: true });
  assert.equal(mutations.length, 0);
  assert.deepEqual(plan.counts, { cita: 2, tratamiento: 2, pago: 2, historia: 1 });
  assert.equal(plan.excludedAppointmentsCount, 1);
  assert.equal(data.records.tratamientos[1].nombre, "Camila");
  data.treatment.celular = "1";
  await assert.rejects(service.synchronizePatientName({ ...input, allowLegacyAliasMigration: true }),
    (error) => error.statusCode === 409);
});

test("repeating the same correction recovers a persisted alias once and is idempotent", async (t) => {
  const treatment = {
    _id: id(1), pacienteId: id(20), nombre: "Camila Pérez", pacienteNombresAnteriores: ["Camila"],
    celular: "987654321", sexo: "Femenino", profesionalId: id(10), rol: "cosmiatra",
    fecha: new Date("2026-10-08T00:00:00Z"), servicio: ["Péptidos"],
  };
  const records = {
    tratamientos: [treatment], historias: [],
    citas: [{
      _id: id(2), cliente: "Camila", profesional: id(10), rol: "cosmiatra",
      fecha: new Date("2026-10-08T15:00:00Z"), servicio: ["Péptidos"], estado: "atendido",
    }],
    pagos: [{ _id: id(3), cita: id(2), cliente: "Camila", total: 80 }],
  };
  const { mutations } = mockRepository(t, records);
  const input = {
    identity: { tratamiento: treatment, patientName: "Camila Pérez" }, nombreNuevo: "Camila Pérez",
  };
  const first = await service.synchronizePatientName(input);
  assert.equal(first.pacienteId, id(20));
  assert.equal(first.changed, true);
  assert.equal(mutations.length, 2);
  assert.ok(records.citas.every((record) => record.cliente === "Camila Pérez" && record.pacienteId === id(20)));
  assert.ok(records.pagos.every((record) => record.cliente === "Camila Pérez" && record.pacienteId === id(20)));
  assert.equal(records.citas[0].estado, "atendido");
  assert.equal(records.pagos[0].total, 80);
  assert.deepEqual(treatment.pacienteNombresAnteriores, ["Camila"]);

  const second = await service.synchronizePatientName(input);
  assert.equal(second.changed, false);
  assert.deepEqual(second.operations, []);
  assert.equal(mutations.length, 2);
  assert.deepEqual(Object.values(records).map((values) => values.length), [1, 0, 1, 1]);
});
