const test = require("node:test");
const assert = require("node:assert/strict");
const HistoriaClinica = require("../models/HistoriaClinica.model");
const PlanAlimentario = require("../models/PlanAlimentario.model");
const repository = require("./planAlimentario.repository");

test("follow-up database projection selects only authorized demographic indicators", async (t) => {
  const original = HistoriaClinica.find;
  t.after(() => { HistoriaClinica.find = original; });
  let filter; let projection;
  const query = { select(fields) { projection = fields; return this; }, sort() { return this; }, lean: async () => [] };
  HistoriaClinica.find = (value) => { filter = value; return query; };
  await repository.listFollowUps();
  assert.deepEqual(filter, { estado: "finalizada", seguimientoAlimentarioHabilitado: true });
  assert.equal(projection.split(" ").includes("datosFormulario"), false);
  assert.ok(projection.includes("datosFormulario.edad"));
  assert.equal(/firma|medico|dni|diagnostico|examen|antecedentes/i.test(projection), false);
});

test("plan update uses one owner/status/revision CAS and model enforces unique history", async (t) => {
  const original = PlanAlimentario.findOneAndUpdate;
  t.after(() => { PlanAlimentario.findOneAndUpdate = original; });
  let filter; let update; let options;
  PlanAlimentario.findOneAndUpdate = (a, b, c) => { filter = a; update = b; options = c; return { lean: async () => null }; };
  const data = { estado: "finalizado", indicaciones: "Texto" };
  await repository.updateDraft({ historiaId: "history", profesionalId: "owner", revision: 3, data });
  assert.deepEqual(filter, { historiaClinicaId: "history", profesionalId: "owner", revision: 3, estado: "borrador" });
  assert.deepEqual(update, { $set: data, $inc: { revision: 1 } });
  assert.deepEqual(options, { new: true, runValidators: true });
  assert.equal(PlanAlimentario.schema.path("historiaClinicaId").options.unique, true);
  assert.equal(PlanAlimentario.schema.path("profesionalId").options.immutable, true);
  assert.equal(HistoriaClinica.schema.path("seguimientoAlimentarioHabilitado").options.default, false);
});
