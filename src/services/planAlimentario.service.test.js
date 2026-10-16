const test = require("node:test");
const assert = require("node:assert/strict");
const { createPlanAlimentarioService, DAYS, MEALS } = require("./planAlimentario.service");

const USER = "507f1f77bcf86cd799439011";
const OTHER = "507f1f77bcf86cd799439012";
const HISTORY = "507f1f77bcf86cd799439013";
const PLAN = "507f1f77bcf86cd799439014";
const actor = { id: USER, rol: "cosmiatra", nombre: "Mismo nombre" };
const history = () => ({
  _id: HISTORY, pacienteId: OTHER, paciente: { nombre: "Nombre actualizado", sexo: "Femenino", celular: "999999999", dni: "secret" },
  estado: "finalizada", seguimientoAlimentarioHabilitado: true,
  finalizadaEn: new Date("2026-10-15T18:00:00Z"),
  firmaMedico: { nombre: "No compartir", url: "secreto" },
  datosFormulario: { edad: "30", pesoClinico: "65.5", tallaClinica: "1.68", imcClinico: "23.2", diagnostico: "No compartir", examenesAuxiliares: [{ examen: "Privado" }] },
});
const body = (complete = false) => ({
  estado: complete ? "finalizado" : "borrador", revision: 0,
  indicadores: complete ? { edad: "30", peso: "65.5", talla: "1.68", imc: "23.2" } : {},
  semana: DAYS.map((dia) => ({ dia, ...Object.fromEntries(MEALS.map((key) => [key, complete ? "Texto redactado por la profesional" : ""])) })),
  indicaciones: complete ? "Indicaciones de la profesional" : "",
});

function fixture(overrides = {}) {
  let saved = null;
  let currentHistory = history();
  const writes = [];
  const repository = {
    listFollowUps: async () => [currentHistory],
    findFollowUp: async () => currentHistory,
    findByHistory: async () => saved,
    findByHistoryIds: async () => saved ? [saved] : [],
    create: async (data) => { writes.push(data); saved = { _id: PLAN, ...data }; return saved; },
    updateDraft: async ({ data, revision }) => { writes.push(data); saved = { ...saved, ...data, revision: revision + 1 }; return saved; },
    ...overrides,
  };
  return {
    service: createPlanAlimentarioService({ repository, now: () => new Date("2026-10-15T19:00:00Z") }),
    writes, repository, setPlan: (plan) => { saved = plan; }, setHistory: (value) => { currentHistory = value; },
  };
}

test("only cosmiatra can access the handoff, including against a same-name doctor", async () => {
  const { service, writes } = fixture();
  for (const invalid of [{ ...actor, rol: "doctor" }, { ...actor, rol: "administrador" }, { ...actor, id: "bad" }, null]) {
    await assert.rejects(() => service.list(invalid), (error) => error.statusCode === 403);
    await assert.rejects(() => service.get(HISTORY, invalid), (error) => error.statusCode === 403);
    await assert.rejects(() => service.save(HISTORY, body(), invalid), (error) => error.statusCode === 403);
  }
  assert.equal(writes.length, 0);
});

test("old histories and drafts never become cosmiatra followups", async () => {
  const { service, setHistory } = fixture();
  for (const value of [{ ...history(), seguimientoAlimentarioHabilitado: false }, { ...history(), seguimientoAlimentarioHabilitado: undefined }, { ...history(), estado: "borrador" }]) {
    setHistory(value);
    assert.deepEqual(await service.list(actor), { seguimientos: [] });
    await assert.rejects(() => service.get(HISTORY, actor), (error) => error.statusCode === 404);
    await assert.rejects(() => service.save(HISTORY, body(), actor), (error) => error.statusCode === 404);
  }
});

test("DTO uses an explicit minimum projection, never doctor data, labs, DNI or full form", async () => {
  const { service } = fixture();
  const { seguimientos } = await service.list(actor);
  assert.deepEqual(seguimientos[0].paciente, { nombre: "Nombre actualizado", sexo: "Femenino", celular: "999999999" });
  assert.deepEqual(seguimientos[0].indicadores, { edad: "30", peso: "65.5", talla: "1.68", imc: "23.2" });
  assert.equal(seguimientos[0].planEstado, "sin_plan");
  assert.equal(seguimientos[0].planId, null);
  for (const forbidden of ["dni", "datosFormulario", "firmaMedico", "diagnostico", "examenesAuxiliares", "secreto"]) {
    assert.equal(JSON.stringify(await service.get(HISTORY, actor)).includes(forbidden), false);
  }
});

test("draft saves allow empty fields and claim immutable professional/history IDs", async () => {
  const { service, writes } = fixture();
  const { plan } = await service.save(HISTORY, body(), actor);
  assert.equal(plan.revision, 1);
  assert.equal(plan.estado, "borrador");
  assert.equal(plan.profesionalId, USER);
  assert.equal(plan.historiaClinicaId, HISTORY);
  assert.equal(plan.finalizadoEn, null);
  assert.equal(writes[0].nombre, undefined);
  assert.equal(writes[0].paciente, undefined);
});

test("the same display name cannot grant access to another professional's plan", async () => {
  const { service, setPlan, writes } = fixture();
  setPlan({ _id: PLAN, historiaClinicaId: HISTORY, profesionalId: OTHER, estado: "borrador", revision: 1 });
  assert.deepEqual(await service.list(actor), { seguimientos: [] });
  await assert.rejects(() => service.get(HISTORY, actor), (error) => error.statusCode === 403);
  await assert.rejects(() => service.save(HISTORY, body(), actor), (error) => error.statusCode === 403);
  assert.equal(writes.length, 0);
});

test("patient renames stay live through the linked history without duplicating or recreating the plan", async () => {
  const { service, setHistory, writes } = fixture();
  const initial = await service.save(HISTORY, body(), actor);
  setHistory({ ...history(), paciente: { ...history().paciente, nombre: "Nombre corregido otra vez" } });
  const current = await service.get(HISTORY, actor);
  assert.equal(current.seguimiento.paciente.nombre, "Nombre corregido otra vez");
  assert.equal(current.plan.id, initial.plan.id);
  assert.equal(writes.length, 1);
});

test("finalization requires all 35 meals, adult indicators and indications", async () => {
  const { service, writes } = fixture();
  await assert.rejects(() => service.save(HISTORY, { ...body(), estado: "finalizado" }, actor), (error) => {
    assert.equal(error.statusCode, 422);
    assert.equal(error.details.fields.length, 40);
    return true;
  });
  const complete = body(true);
  complete.semana[3].cena = " ";
  await assert.rejects(() => service.save(HISTORY, complete, actor), (error) => error.statusCode === 422 && error.details.fields.includes("semana.3.cena"));
  assert.equal(writes.length, 0);
});

test("a finalized plan is read-only and repeated save cannot change its completion date", async () => {
  const { service, writes } = fixture();
  const { plan } = await service.save(HISTORY, body(true), actor);
  assert.equal(plan.estado, "finalizado");
  assert.equal(plan.finalizadoEn.toISOString(), "2026-10-15T19:00:00.000Z");
  await assert.rejects(() => service.save(HISTORY, { ...body(true), revision: 1 }, actor), (error) => error.statusCode === 409);
  assert.equal(writes.length, 1);
});

test("draft validation rejects malformed days, excessive text, forged owners and invalid numbers", async () => {
  const mutations = [
    (value) => { value.semana = []; },
    (value) => { value.semana[1].dia = "Lunes"; },
    (value) => { value.semana[1].cena = "x".repeat(1501); },
    (value) => { value.indicaciones = "x".repeat(4001); },
    (value) => { value.profesionalId = OTHER; },
    (value) => { value.indicadores.edad = "17"; },
    (value) => { value.indicadores.peso = "-1"; },
    (value) => { value.indicadores.talla = "Infinity"; },
    (value) => { value.indicadores.imc = "1e4"; },
    (value) => { value.revision = "0"; },
  ];
  for (const mutate of mutations) {
    const { service, writes } = fixture();
    const value = body(); mutate(value);
    await assert.rejects(() => service.save(HISTORY, value, actor), (error) => error.statusCode === 400);
    assert.equal(writes.length, 0);
  }
});

test("optimistic revision prevents overwriting another tab and successful update increments it", async () => {
  const { service, writes } = fixture();
  await service.save(HISTORY, body(), actor);
  await assert.rejects(() => service.save(HISTORY, body(), actor), (error) => error.statusCode === 409);
  const next = await service.save(HISTORY, { ...body(), revision: 1 }, actor);
  assert.equal(next.plan.revision, 2);
  assert.equal(writes.length, 2);
  const failedCas = fixture({ findByHistory: async () => ({ profesionalId: USER, estado: "borrador", revision: 1 }), updateDraft: async () => null });
  await assert.rejects(() => failedCas.service.save(HISTORY, { ...body(), revision: 1 }, actor), (error) => error.statusCode === 409);
});

test("a unique-index first-save race never transfers ownership or creates duplicates", async () => {
  let reads = 0;
  const raced = fixture({
    findByHistory: async () => ++reads === 1 ? null : { profesionalId: OTHER },
    create: async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); },
  });
  await assert.rejects(() => raced.service.save(HISTORY, body(), actor), (error) => error.statusCode === 403);
  const sameOwner = fixture({
    findByHistory: async () => ++reads === 3 ? null : { profesionalId: USER },
    create: async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); },
  });
  await assert.rejects(() => sameOwner.service.save(HISTORY, body(), actor), (error) => error.statusCode === 409);
});

test("invalid history IDs are rejected before any repository call", async () => {
  const { service } = fixture({ findByHistory: async () => { throw new Error("must not query"); } });
  for (const id of ["bad", "../secret", { $ne: null }]) {
    await assert.rejects(() => service.get(id, actor), (error) => error.statusCode === 400);
    await assert.rejects(() => service.save(id, body(), actor), (error) => error.statusCode === 400);
  }
});
