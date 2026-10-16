const assert = require("node:assert/strict");
const test = require("node:test");
const Cita = require("../models/Cita.model");
const Tratamiento = require("../models/Tratamiento.model");
const HistoriaClinica = require("../models/HistoriaClinica.model");
const repository = require("./patientDemographics.repository");

test("appointment lookup projects only the fields needed to authorize minimal intake data", async (t) => {
  const original = Cita.findById;
  t.after(() => { Cita.findById = original; });
  let projection;
  Cita.findById = (id) => {
    assert.equal(id, "appointment-id");
    return { select(fields) { projection = fields; return this; }, lean() { return { cliente: "Camila" }; } };
  };
  assert.deepEqual(await repository.findAppointment("appointment-id"), { cliente: "Camila" });
  assert.equal(projection, "cliente pacienteId profesional rol");
});

test("cross-specialty demographics use bounded patient-id queries with no clinical data or name criteria", async (t) => {
  const originalTreatment = Tratamiento.findOne;
  const originalHistory = HistoriaClinica.findOne;
  t.after(() => { Tratamiento.findOne = originalTreatment; HistoriaClinica.findOne = originalHistory; });
  const calls = [];
  const mock = (source) => (criteria) => {
    const call = { source, criteria };
    calls.push(call);
    return {
      select(fields) { call.select = fields; return this; },
      sort(value) { call.sort = value; return this; },
      lean() { return { pacienteId: "verified-id", [source]: true }; },
    };
  };
  Tratamiento.findOne = mock("tratamiento");
  HistoriaClinica.findOne = mock("historia");
  const result = await repository.findLatestByPatientId("verified-id");
  assert.equal(result.tratamientos.length, 2);
  assert.equal(result.historias.length, 2);
  assert.deepEqual(calls.map((call) => Object.keys(call.criteria)), [
    ["pacienteId", "sexo"], ["pacienteId", "celular"], ["pacienteId", "paciente.sexo"], ["pacienteId", "paciente.celular"],
  ]);
  for (const call of calls) {
    assert.equal(call.criteria.pacienteId, "verified-id");
    assert.deepEqual(call.sort, { updatedAt: -1, _id: -1 });
    assert.equal(call.select, call.source === "tratamiento"
      ? "pacienteId sexo celular updatedAt" : "pacienteId paciente.sexo paciente.celular updatedAt");
    for (const field of ["datosFormulario", "observacion", "imagenes", "paciente.dni", "paciente.nombre", "profesionalId"]) {
      assert.equal(call.select.split(" ").includes(field), false);
    }
  }
});
