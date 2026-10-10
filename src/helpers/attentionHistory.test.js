const assert = require("node:assert/strict");
const test = require("node:test");
const { Types } = require("mongoose");
const { buildAttentionHistory } = require("./attentionHistory");

const id = (suffix) => `507f1f77bcf86cd799439${String(suffix).padStart(3, "0")}`;
function fixture() {
  const cita = {
    _id: id(1), cliente: "Paciente Actual", pacienteId: id(2),
    profesional: { _id: id(3), nombre: "Profesional Actual", rol: "cosmiatra" },
    rol: "cosmiatra", servicio: ["Mascarilla facial personalizada"],
    fecha: new Date("2026-05-01T23:45:00.000Z"), estado: "atendido",
  };
  const treatment = {
    _id: id(4), nombre: cita.cliente, pacienteId: id(2), profesionalId: id(3),
    profesional: "Profesional Actual", rol: "cosmiatra", servicio: [...cita.servicio],
    fecha: new Date("2026-05-01T00:00:00.000Z"), celular: "000000000", sexo: "Femenino",
    observacion: "Only a real treatment contains this fixture", insumos: ["Fixture"], imagenes: [],
  };
  return { cita, treatment };
}

test("attended cita-only records expose operational metadata and a distinct source id", () => {
  const { cita } = fixture();
  cita.profesional.email = "must-not-be-present";
  cita.observacion = "must-not-be-present";
  const [row] = buildAttentionHistory({ citas: [cita] });
  assert.equal(row._id, `cita:${id(1)}`);
  assert.equal(row.citaId, id(1));
  assert.equal(row.pacienteId, id(2));
  assert.equal(row.profesionalId, id(3));
  assert.equal(row.profesional, "Profesional Actual");
  assert.equal(row.registroTratamientoPendiente, true);
  assert.equal(row.origenRegistro, "cita");
  assert.deepEqual(row.cita.profesional, { _id: id(3), nombre: "Profesional Actual", rol: "cosmiatra" });
  for (const field of ["observacion", "insumos", "imagenes", "sexo", "celular", "tratamientoId"]) {
    assert.equal(Object.hasOwn(row, field), false);
  }
  assert.equal(Object.hasOwn(row.cita, "observacion"), false);
});

test("an explicit treatment reference suppresses its cita and retains its real date and clinical fields", () => {
  const { cita, treatment } = fixture();
  treatment.cita = { _id: new Types.ObjectId(cita._id), rol: "cosmiatra" };
  const [row] = buildAttentionHistory({ tratamientos: [treatment], citas: [cita] });
  assert.equal(row._id, treatment._id);
  assert.equal(row.fecha, treatment.fecha);
  assert.equal(row.observacion, treatment.observacion);
  assert.equal(row.cita._id, cita._id);
  assert.equal(row.cita.fecha, cita.fecha);
  assert.equal(row.registroTratamientoPendiente, undefined);
  assert.equal(treatment.cita.fecha, undefined);
});

test("adding a real linked treatment replaces the appointment-only row without duplicates", () => {
  const { cita, treatment } = fixture();
  const before = buildAttentionHistory({ citas: [cita] });
  const after = buildAttentionHistory({ tratamientos: [{ ...treatment, cita: cita._id }], citas: [cita] });
  assert.equal(before.length, 1);
  assert.equal(after.length, 1);
  assert.equal(before[0].registroTratamientoPendiente, true);
  assert.equal(after[0]._id, treatment._id);
  assert.equal(after[0].registroTratamientoPendiente, undefined);
});

test("an unpopulated Mongo cita reference is enriched without exposing ObjectId internals", () => {
  const { cita, treatment } = fixture();
  treatment.cita = new Types.ObjectId(cita._id);
  const [row] = buildAttentionHistory({ tratamientos: [treatment], citas: [cita] });
  assert.equal(row.cita._id, cita._id);
  assert.equal(row.cita.fecha, cita.fecha);
  assert.equal(Object.hasOwn(row.cita, "buffer"), false);
});

test("a unique legacy counterpart merges by immutable patient id despite renamed display fields", () => {
  const { cita, treatment } = fixture();
  treatment.nombre = "Paciente Anterior";
  const [row] = buildAttentionHistory({ tratamientos: [treatment], citas: [cita] });
  assert.equal(row._id, treatment._id);
  assert.equal(row.cita._id, cita._id);
  assert.equal(row.cita.fecha, cita.fecha);
  assert.equal(treatment.cita, undefined);
});

test("legacy name and persisted aliases are considered only if both sides lack patient ids", () => {
  const { cita, treatment } = fixture();
  delete cita.pacienteId;
  delete treatment.pacienteId;
  treatment.nombre = "Nombre corregido";
  treatment.pacienteNombresAnteriores = ["  PACIENTE   ACTUAL  "];
  const result = buildAttentionHistory({ tratamientos: [treatment], citas: [cita] });
  assert.equal(result.length, 1);
  assert.equal(result[0].cita._id, cita._id);
});

for (const mutate of [
  ({ cita }) => { cita.pacienteId = id(5); },
  ({ cita }) => { delete cita.pacienteId; },
  ({ treatment }) => { delete treatment.pacienteId; },
  ({ cita }) => { cita.profesional = { ...cita.profesional, _id: id(5) }; },
  ({ cita }) => { cita.rol = "doctor"; },
  ({ cita }) => { cita.fecha = new Date("2026-05-02T15:00:00Z"); },
  ({ cita }) => { cita.servicio = ["Different service"]; },
  ({ cita }) => { cita.servicio.push(cita.servicio[0]); },
]) {
  test(`legacy mismatches remain separate: ${mutate.toString()}`, () => {
    const data = fixture();
    mutate(data);
    const result = buildAttentionHistory({ tratamientos: [data.treatment], citas: [data.cita] });
    assert.equal(result.length, 2);
    assert.equal(result.find((row) => row._id === data.treatment._id).cita, undefined);
  });
}

test("service order and formatting do not change the exact multiset", () => {
  const { cita, treatment } = fixture();
  cita.servicio = [" Limpieza ", "Mascarilla", "mascarilla"];
  treatment.servicio = ["MASCARILLA", "limpieza", "mascarilla"];
  assert.equal(buildAttentionHistory({ tratamientos: [treatment], citas: [cita] }).length, 1);
});

test("appointments at UTC midnight retain their actual Lima calendar day", () => {
  const { cita, treatment } = fixture();
  cita.fecha = new Date("2026-05-02T00:00:00Z");
  assert.equal(buildAttentionHistory({ tratamientos: [treatment], citas: [cita] }).length, 1);
  cita.fecha = new Date("2026-05-01T00:00:00Z");
  assert.equal(buildAttentionHistory({ tratamientos: [treatment], citas: [cita] }).length, 2);
});

test("ambiguous repeated visits do not acquire a guessed treatment link", () => {
  const { cita, treatment } = fixture();
  const second = { ...cita, _id: id(6), fecha: new Date("2026-05-01T20:00:00Z") };
  const result = buildAttentionHistory({ tratamientos: [treatment], citas: [cita, second] });
  assert.equal(result.length, 3);
  assert.equal(result.find((row) => row._id === treatment._id).cita, undefined);
});

test("ambiguous repeated treatments do not suppress an attended appointment", () => {
  const { cita, treatment } = fixture();
  const result = buildAttentionHistory({ tratamientos: [treatment, { ...treatment, _id: id(7) }], citas: [cita] });
  assert.equal(result.length, 3);
  assert.equal(result.filter((row) => row.registroTratamientoPendiente).length, 1);
});

test("aliases cannot let one unverified treatment consume two appointments", () => {
  const { cita, treatment } = fixture();
  delete cita.pacienteId;
  delete treatment.pacienteId;
  treatment.pacienteNombresAnteriores = ["Nombre anterior"];
  const second = { ...cita, _id: id(6), cliente: "Nombre anterior" };
  assert.equal(buildAttentionHistory({ tratamientos: [treatment], citas: [cita, second] }).length, 3);
});

test("an existing cita link cannot be reassigned to a matching legacy visit", () => {
  const { cita, treatment } = fixture();
  treatment.cita = id(8);
  const result = buildAttentionHistory({ tratamientos: [treatment], citas: [cita] });
  assert.equal(result.length, 2);
  assert.equal(result.find((row) => row._id === treatment._id).cita, id(8));
});

test("explicit links are resolved before deciding legacy uniqueness", () => {
  const { cita, treatment } = fixture();
  const second = { ...cita, _id: id(6) };
  const linked = { ...treatment, _id: id(7), cita: cita._id };
  const result = buildAttentionHistory({ tratamientos: [linked, treatment], citas: [cita, second] });
  assert.equal(result.length, 2);
  assert.equal(result.find((row) => row._id === treatment._id).cita._id, second._id);
});

test("demographics come only from the same known patient in the scoped treatment input", () => {
  const { cita, treatment } = fixture();
  treatment.servicio = ["Different service"];
  const [operational] = buildAttentionHistory({ tratamientos: [treatment], citas: [cita] });
  assert.equal(operational.registroTratamientoPendiente, true);
  assert.equal(operational.celular, treatment.celular);
  assert.equal(operational.sexo, treatment.sexo);
  const foreign = { ...treatment, pacienteId: id(9) };
  const mismatched = buildAttentionHistory({ tratamientos: [foreign], citas: [cita] }).find((row) => row.origenRegistro === "cita");
  assert.equal(Object.hasOwn(mismatched, "celular"), false);
  assert.equal(Object.hasOwn(mismatched, "sexo"), false);
  const unnamed = buildAttentionHistory({ tratamientos: [treatment], citas: [{ ...cita, pacienteId: undefined }] })
    .find((row) => row.origenRegistro === "cita");
  assert.equal(Object.hasOwn(unnamed, "celular"), false);
});

test("non-attended appointments never become operational records and duplicate source ids appear once", () => {
  const { cita } = fixture();
  const citas = [cita, { ...cita }, ...["pendiente", "cancelado", "aplazado"].map((estado, index) =>
    ({ ...cita, _id: id(index + 10), estado }))];
  assert.equal(buildAttentionHistory({ citas }).length, 1);
});

test("incomplete legacy evidence is not enough to deduplicate", () => {
  const { cita, treatment } = fixture();
  treatment.fecha = "invalid";
  assert.equal(buildAttentionHistory({ tratamientos: [treatment], citas: [cita] }).length, 2);
  treatment.fecha = cita.fecha;
  treatment.servicio = [];
  cita.servicio = [];
  assert.equal(buildAttentionHistory({ tratamientos: [treatment], citas: [cita] }).length, 2);
});

test("multiple genuine appointments stay visible in newest-first order", () => {
  const { cita } = fixture();
  const later = { ...cita, _id: id(6), fecha: new Date("2026-06-01T20:00:00Z") };
  const result = buildAttentionHistory({ citas: [cita, later] });
  assert.deepEqual(result.map((row) => row.citaId), [later._id, cita._id]);
});
