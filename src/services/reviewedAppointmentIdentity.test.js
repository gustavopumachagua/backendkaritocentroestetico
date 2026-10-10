const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("./patientIdentity.service");
const repository = require("../repositories/patientIdentity.repository");
const historiaService = require("./historiaClinica.service");
const historiaController = require("../controllers/historiaClinica.controller");
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

function fixture() {
  const treatment = {
    _id: id(1), pacienteId: id(30), nombre: "Camila Pérez", pacienteNombresAnteriores: ["Camila"],
    celular: "987654321", sexo: "Femenino", cita: id(2), profesionalId: id(10),
    rol: "doctor", fecha: "2026-10-08T00:00:00.000Z", servicio: ["Consulta"],
  };
  const cita = {
    _id: id(2), pacienteId: id(30), cliente: "Camila Pérez", profesional: id(10),
    rol: "doctor", fecha: "2026-10-08T15:00:00.000Z", servicio: ["Consulta"], estado: "atendido",
  };
  const history = {
    _id: id(3), pacienteId: id(30), pacienteNombresAnteriores: ["Camila"],
    tratamiento: id(1), cita: id(2), medico: id(10), estado: "finalizada",
    paciente: { nombre: "Camila Pérez", celular: "987654321", sexo: "Femenino" },
    datosFormulario: { nombreCompleto: "Camila Pérez", diagnostico: "Persisted answer" },
    firmaMedico: { url: "saved-signature", nombre: "Dra. Actual" },
  };
  const { pacienteId: _sourcePatientId, ...legacyCita } = cita;
  const reviewed = ["pendiente", "atendido", "cancelado", "aplazado"].map((estado, index) => ({
    ...legacyCita, _id: id(100 + index), cliente: "Camila", estado,
    fecha: `2026-10-${String(20 + index).padStart(2, "0")}T15:00:00.000Z`,
  }));
  const unreviewed = { ...reviewed[2], _id: id(200) };
  const records = {
    tratamientos: [treatment], historias: [history], citas: [cita, ...reviewed, unreviewed],
    pagos: reviewed.map((record, index) => ({
      _id: id(300 + index), cita: record._id, cliente: "Camila", total: 80 + index, estadoPago: "pagado",
    })),
  };
  const input = {
    identity: { tratamiento: treatment, cita, patientName: "Camila Pérez" }, existing: history,
    nombreNuevo: "Camila Pérez", approvedAppointmentIds: reviewed.map(getId), allowLegacyAliasMigration: true,
  };
  return { records, reviewed, unreviewed, treatment, cita, history, input };
}

function mockRepository(t, records, { failAt = Infinity } = {}) {
  const original = { ...repository };
  const queries = [];
  const mutations = [];
  const restored = [];
  const types = { cita: "citas", tratamiento: "tratamientos", historia: "historias", pago: "pagos" };
  t.after(() => Object.assign(repository, original));
  repository.findCandidates = async (query) => {
    queries.push(query);
    return structuredClone(records);
  };
  repository.applyMutation = async (operation) => {
    const record = records[types[operation.type]].find((value) => getId(value) === operation.id);
    assert.ok(Object.entries({ ...operation.previous, ...operation.guard }).every(([path, value]) =>
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
  return { queries, mutations, restored };
}

for (const flag of [undefined, false, "true", 1]) {
  test(`reviewed appointment IDs require the explicit internal migration flag: ${String(flag)}`, async (t) => {
    const data = fixture();
    const calls = mockRepository(t, data.records);
    await assert.rejects(service.synchronizePatientName({ ...data.input, allowLegacyAliasMigration: flag }),
      (error) => error.statusCode === 400);
    assert.equal(calls.queries.length, 0);
    assert.equal(calls.mutations.length, 0);
  });
}

for (const ids of [null, "", {}, [""], ["invalid"], [1], [{}], Array(1), [` ${id(100)}`],
  Array.from({ length: 101 }, () => id(100))]) {
  test(`invalid reviewed appointment IDs are rejected: ${JSON.stringify(ids).slice(0, 80)}`, async (t) => {
    const data = fixture();
    const calls = mockRepository(t, data.records);
    await assert.rejects(service.synchronizePatientName({ ...data.input, approvedAppointmentIds: ids }),
      (error) => error.statusCode === 400);
    assert.equal(calls.queries.length, 0);
    assert.equal(calls.mutations.length, 0);
  });
}

test("every reviewed ID must be present in the original candidate query", async (t) => {
  const data = fixture();
  const calls = mockRepository(t, data.records);
  await assert.rejects(service.synchronizePatientName({ ...data.input, approvedAppointmentIds: [...data.input.approvedAppointmentIds, id(999)] }),
    (error) => error.statusCode === 409);
  assert.equal(calls.mutations.length, 0);
  assert.deepEqual(calls.queries, [{
    names: ["Camila Pérez", "Camila"], pacienteId: id(30), citaIds: [id(2)], treatmentIds: [id(1)],
  }]);
});

test("explicit review cannot link an unknown name or a foreign patient ID", async (t) => {
  const data = fixture();
  const calls = mockRepository(t, data.records);
  data.reviewed[0].cliente = "Otra persona";
  await assert.rejects(service.synchronizePatientName(data.input), (error) => error.statusCode === 409);
  data.reviewed[0].cliente = "Camila";
  data.reviewed[1].pacienteId = id(99);
  await assert.rejects(service.synchronizePatientName(data.input), (error) => error.statusCode === 409);
  assert.equal(calls.mutations.length, 0);
});

test("review requires persisted source contact or DNI, never submitted contact alone", async (t) => {
  const data = fixture();
  const calls = mockRepository(t, data.records);
  delete data.treatment.celular;
  delete data.history.paciente.celular;
  await assert.rejects(service.synchronizePatientName({ ...data.input, formData: { dni: "12345678", telefono: "987654321" } }),
    (error) => error.statusCode === 409);
  assert.equal(calls.queries.length, 0);
  assert.equal(calls.mutations.length, 0);
  data.treatment.pacienteDni = "12345678";
  const plan = await service.synchronizePatientName({ ...data.input, dryRun: true });
  assert.equal(plan.changed, true);
  assert.equal(calls.mutations.length, 0);
});

test("persisted existing history contact can verify the internal review", async (t) => {
  const data = fixture();
  mockRepository(t, data.records);
  delete data.treatment.celular;
  const plan = await service.synchronizePatientName({ ...data.input, dryRun: true });
  assert.deepEqual(plan.counts, { cita: 4, tratamiento: 0, pago: 4, historia: 0 });
});

test("reviewed names also require a boolean internal migration flag", async (t) => {
  const data = fixture();
  const calls = mockRepository(t, data.records);
  await assert.rejects(service.synchronizePatientName({
    ...data.input, approvedAppointmentIds: [], approvedPreviousNames: ["Camila"], allowLegacyAliasMigration: "true",
  }), (error) => error.statusCode === 400);
  assert.equal(calls.mutations.length, 0);
});

test("ordinary corrections still exclude unverified name-only reservations", async (t) => {
  const data = fixture();
  const calls = mockRepository(t, data.records);
  const plan = await service.synchronizePatientName({ ...data.input, approvedAppointmentIds: [], allowLegacyAliasMigration: false, dryRun: true });
  assert.deepEqual(plan.counts, { cita: 0, tratamiento: 0, pago: 0, historia: 0 });
  assert.equal(plan.excludedAppointmentsCount, 5);
  assert.equal(calls.mutations.length, 0);
});

test("reviewed aliases repair each state, preserve other fields and remain idempotent", async (t) => {
  const data = fixture();
  const before = structuredClone(data.records);
  const calls = mockRepository(t, data.records);
  const input = { ...data.input, approvedAppointmentIds: [...data.input.approvedAppointmentIds.map((value) => value.toUpperCase()), id(100)] };
  const firstPlan = await service.synchronizePatientName({ ...input, dryRun: true });
  const repeatedPlan = await service.synchronizePatientName({ ...input, dryRun: true });
  assert.deepEqual(firstPlan, repeatedPlan);
  assert.deepEqual(firstPlan.counts, { cita: 4, tratamiento: 0, pago: 4, historia: 0 });
  assert.equal(firstPlan.excludedAppointmentsCount, 1);
  assert.equal(calls.mutations.length, 0);
  assert.deepEqual(data.records, before);

  const applied = await service.synchronizePatientName(input);
  assert.equal(applied.changed, true);
  assert.equal(calls.mutations.length, 8);
  for (const record of data.reviewed) {
    const original = before.citas.find((value) => value._id === record._id);
    assert.deepEqual(record, { ...original, cliente: "Camila Pérez", pacienteId: id(30) });
  }
  for (const record of data.records.pagos) {
    const original = before.pagos.find((value) => value._id === record._id);
    assert.deepEqual(record, { ...original, cliente: "Camila Pérez", pacienteId: id(30) });
  }
  assert.deepEqual(data.records.tratamientos, before.tratamientos);
  assert.deepEqual(data.records.historias, before.historias);
  assert.deepEqual(data.unreviewed, before.citas.at(-1));
  assert.deepEqual(Object.values(data.records).map((values) => values.length), Object.values(before).map((values) => values.length));

  const repeated = await service.synchronizePatientName(input);
  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.operations, []);
  const finalPlan = await service.synchronizePatientName({ ...input, dryRun: true });
  assert.deepEqual(finalPlan.counts, { cita: 0, tratamiento: 0, pago: 0, historia: 0 });
  assert.equal(calls.mutations.length, 8);
});

test("a failed reviewed repair compensates guarded earlier mutations", async (t) => {
  const data = fixture();
  const before = structuredClone(data.records);
  const calls = mockRepository(t, data.records, { failAt: 3 });
  await assert.rejects(service.synchronizePatientName(data.input), /persistence failed/);
  assert.equal(calls.restored.length, 3);
  assert.deepEqual(data.records, before);
});

test("HTTP save and lookup never forward internal review options", async (t) => {
  const original = { ...historiaService };
  t.after(() => Object.assign(historiaService, original));
  const inputs = [];
  historiaService.guardarHistoriaClinica = async (input) => {
    inputs.push(input);
    return { historia: null, creada: false, finalizadaAhora: false };
  };
  historiaService.obtenerHistoriaPorPaciente = async (input) => { inputs.push(input); return null; };
  const options = { approvedAppointmentIds: [id(100)], approvedPreviousNames: ["Camila"], allowLegacyAliasMigration: true };
  const req = {
    user: { id: id(10) }, params: {},
    body: { ...options, patientName: "Camila Pérez", formData: { nombreCompleto: "Camila Pérez", ...options } },
    query: options,
  };
  for (const handler of [historiaController.guardarHistoriaClinica, historiaController.obtenerHistoriaPorPaciente]) {
    await new Promise((resolve, reject) => handler(req, {
      status(code) { assert.equal(code, 200); return this; }, json: resolve,
    }, reject));
  }
  assert.equal(inputs.length, 2);
  for (const input of inputs) {
    assert.equal(input.doctorId, id(10));
    assert.equal(input.patientName, "Camila Pérez");
    for (const key of Object.keys(options)) assert.equal(Object.hasOwn(input, key), false);
  }
});
