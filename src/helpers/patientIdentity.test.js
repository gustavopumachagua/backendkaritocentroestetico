const test = require("node:test");
const assert = require("node:assert/strict");
const { Types } = require("mongoose");
const { getId, normalizePhone, selectPatientRecords } = require("./patientIdentity");
const { buildClinicalHistoryIdentityKey } = require("./clinicalHistoryIdentity");

const id = (number) => number.toString(16).padStart(24, "0");
function fixture() {
  const treatment = { _id: id(1), nombre: "Camila", celular: "987654321", sexo: "Femenino",
    profesionalId: id(10), rol: "doctor", fecha: new Date("2026-10-08T00:00:00Z"), servicio: ["Péptidos"] };
  const cita = { _id: id(2), cliente: "Camila", profesional: id(10), rol: "doctor",
    fecha: new Date("2026-10-08T15:00:00Z"), servicio: ["Péptidos"], estado: "atendido" };
  return { treatment, cita, records: { tratamientos: [treatment], citas: [cita], historias: [], pagos: [] } };
}
const select = (data, extra = {}) => selectPatientRecords({
  identity: { tratamiento: data.treatment, patientName: "Camila" }, records: data.records,
  pacienteId: id(1), names: ["Camila"], ...extra,
});

test("real ObjectIds and populated records produce hex IDs, never internal buffers", () => {
  const objectId = new Types.ObjectId(id(1));
  assert.equal(getId(objectId), id(1));
  assert.equal(getId({ _id: objectId }), id(1));
  assert.equal(getId({ id: Buffer.from("wrong") }), "");
  assert.equal(buildClinicalHistoryIdentityKey({ citaId: objectId }), `cita:${id(1)}`);
});

test("contact evidence validates digits and normalizes Peru international prefixes", () => {
  assert.equal(normalizePhone("+51 987 654 321"), "987654321");
  assert.equal(normalizePhone("987654321"), "987654321");
  assert.equal(normalizePhone("1"), "");
  assert.equal(normalizePhone(""), "");
});

test("an attended legacy visit is recovered only with a verified unique counterpart", () => {
  const data = fixture();
  data.records.pagos.push({ _id: id(3), cita: id(2), cliente: "Camila" });
  const result = select(data);
  assert.deepEqual(result.citas.map(getId), [id(2)]);
  assert.deepEqual(result.pagos.map(getId), [id(3)]);
});

test("pending name-only visits are not silently renamed", () => {
  const data = fixture();
  data.cita.estado = "pendiente";
  const result = select(data);
  assert.equal(result.citas.length, 0);
  assert.equal(result.excludedCitas.length, 1);
});

test("a source lacking persisted contact cannot establish legacy visit identity", () => {
  const data = fixture();
  data.treatment.celular = "1";
  assert.equal(select(data, { submittedDni: "12345678" }).citas.length, 0);
});

test("duplicate services and ambiguous same-day visits are not merged", () => {
  const data = fixture();
  data.treatment.servicio = ["Péptidos", "Péptidos"];
  assert.equal(select(data).citas.length, 0);
  data.treatment.servicio = ["Péptidos"];
  data.records.citas.push({ ...data.cita, _id: id(4) });
  assert.equal(select(data).citas.length, 0);
});

test("homonymous patients with another contact or stable identity stay separate", () => {
  const data = fixture();
  data.records.tratamientos.push(
    { ...data.treatment, _id: id(5), celular: "912345678" },
    { ...data.treatment, _id: id(6), pacienteId: id(99) },
    { ...data.treatment, _id: id(7), pacienteDni: "87654321" },
  );
  const result = select(data, { submittedDni: "12345678" });
  assert.deepEqual(result.tratamientos.map(getId), [id(1)]);
});

test("an authoritative patient ID follows later corrections without matching a name", () => {
  const data = fixture();
  data.records.citas.push({ ...data.cita, _id: id(8), cliente: "Camila anterior", pacienteId: id(1), estado: "pendiente" });
  assert.ok(select(data).citas.some((cita) => getId(cita) === id(8)));
});

test("persisted treatment aliases recover an attended visit after a partial rename", () => {
  const data = fixture();
  data.treatment.nombre = "Camila Pérez";
  data.treatment.pacienteId = id(1);
  data.treatment.pacienteNombresAnteriores = ["Camila", "Cámila", " camila "];
  data.records.pagos.push({ _id: id(3), cita: id(2), cliente: "Camila" });
  const result = select(data, { names: ["Camila Pérez", "Camila"] });
  assert.deepEqual(result.citas.map(getId), [id(2)]);
  assert.deepEqual(result.pagos.map(getId), [id(3)]);
});

test("requested names alone cannot replace a persisted treatment alias", () => {
  const data = fixture();
  data.treatment.nombre = "Camila Pérez";
  data.treatment.pacienteId = id(1);
  assert.equal(select(data, { names: ["Camila Pérez", "Camila"] }).citas.length, 0);
});

for (const [label, extra] of [
  ["another immutable identity", { pacienteId: id(99) }],
  ["conflicting phone", { celular: "912345678" }],
  ["conflicting sex", { sexo: "Masculino" }],
]) {
  test(`an alias competitor with ${label} still prevents automatic legacy recovery`, () => {
    const data = fixture();
    data.treatment.nombre = "Camila Pérez";
    data.treatment.pacienteNombresAnteriores = ["Camila"];
    data.records.tratamientos.push({
      ...data.treatment, _id: id(9), nombre: "Otra Camila", ...extra,
    });
    const result = select(data, { names: ["Camila Pérez", "Camila"] });
    assert.deepEqual(result.tratamientos.map(getId), [id(1)]);
    assert.equal(result.citas.length, 0);
  });
}

test("a conflicting DNI alias competitor still prevents automatic legacy recovery", () => {
  const data = fixture();
  data.treatment.nombre = "Camila Pérez";
  data.treatment.pacienteDni = "12345678";
  data.treatment.pacienteNombresAnteriores = ["Camila"];
  data.records.tratamientos.push({
    ...data.treatment, _id: id(9), nombre: "Otra Camila", pacienteDni: "87654321",
  });
  const result = select(data, { names: ["Camila Pérez", "Camila"] });
  assert.deepEqual(result.tratamientos.map(getId), [id(1)]);
  assert.equal(result.citas.length, 0);
});

test("multiple visits under different persisted aliases remain ambiguous", () => {
  const data = fixture();
  data.treatment.nombre = "Camila Pérez";
  data.treatment.pacienteNombresAnteriores = ["Camila"];
  data.records.citas.push({ ...data.cita, _id: id(9), cliente: "Camila Pérez" });
  assert.equal(select(data, { names: ["Camila Pérez", "Camila"] }).citas.length, 0);
});

test("duplicate visits are ambiguous even when every treatment has the same patient ID", () => {
  const data = fixture();
  data.treatment.pacienteId = id(1);
  data.treatment.nombre = "Camila Pérez";
  data.treatment.pacienteNombresAnteriores = ["Camila"];
  data.records.tratamientos.push({ ...data.treatment, _id: id(8) });
  data.records.citas.push({ ...data.cita, _id: id(9) });
  assert.equal(select(data, { names: ["Camila Pérez", "Camila"] }).citas.length, 0);
});

for (const estado of ["pendiente", "cancelado", "aplazado"]) {
  test(`a persisted alias cannot adopt a name-only ${estado} booking`, () => {
    const data = fixture();
    data.treatment.nombre = "Camila Pérez";
    data.treatment.pacienteNombresAnteriores = ["Camila"];
    data.cita.estado = estado;
    data.records.pagos.push({ _id: id(3), cita: id(2), cliente: "Camila" });
    const result = select(data, { names: ["Camila Pérez", "Camila"] });
    assert.equal(result.citas.length, 0);
    assert.equal(result.pagos.length, 0);
    assert.equal(result.excludedCitas.length, 1);
  });
}

test("a canceled counterpart still counts when checking alias visit ambiguity", () => {
  const data = fixture();
  data.treatment.nombre = "Camila Pérez";
  data.treatment.pacienteNombresAnteriores = ["Camila"];
  data.records.citas.push({
    ...data.cita, _id: id(9), cliente: "Camila Pérez", estado: "cancelado",
  });
  assert.equal(select(data, { names: ["Camila Pérez", "Camila"] }).citas.length, 0);
});

test("a legacy alias visit already assigned to another patient is excluded", () => {
  const data = fixture();
  data.treatment.nombre = "Camila Pérez";
  data.treatment.pacienteNombresAnteriores = ["Camila"];
  data.cita.pacienteId = id(99);
  assert.equal(select(data, { names: ["Camila Pérez", "Camila"] }).citas.length, 0);
});

test("a treatment without persisted contact cannot verify its legacy alias visit", () => {
  const data = fixture();
  data.treatment.nombre = "Camila Pérez";
  data.treatment.pacienteId = id(1);
  data.treatment.pacienteNombresAnteriores = ["Camila"];
  data.treatment.celular = "1";
  assert.equal(select(data, { names: ["Camila Pérez", "Camila"], submittedDni: "12345678" }).citas.length, 0);
});
