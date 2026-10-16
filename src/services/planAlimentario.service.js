const AppError = require("../errors/AppError");
const { OBJECT_ID_REGEX } = require("../constants");
const defaultRepository = require("../repositories/planAlimentario.repository");

const DAYS = Object.freeze(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);
const MEALS = Object.freeze(["desayuno", "mediaManana", "almuerzo", "mediaTarde", "cena"]);
const INDICATORS = Object.freeze(["edad", "peso", "talla", "imc"]);
const idOf = (value) => String(value?._id || value?.id || value || "");
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const textOf = (value) => value === undefined || value === null ? "" : String(value).trim();

function requireId(value) {
  const id = idOf(value);
  if (!OBJECT_ID_REGEX.test(id)) throw new AppError("La historia clínica no es válida.", 400);
  return id;
}

function authorize(actor) {
  if (actor?.rol !== "cosmiatra" || !OBJECT_ID_REGEX.test(idOf(actor.id))) {
    throw new AppError("No tienes permiso para gestionar planes alimentarios.", 403);
  }
  return idOf(actor.id);
}

function ensureOwner(plan, professionalId) {
  if (plan && idOf(plan.profesionalId) !== professionalId) {
    throw new AppError("Este plan alimentario pertenece a otra profesional.", 403);
  }
}

function validateKeys(object, allowed) {
  if (!isObject(object) || Object.keys(object).some((key) => !allowed.includes(key))) {
    throw new AppError("Los datos del plan alimentario no son válidos.", 400);
  }
}

function boundedText(value, maximum, field) {
  if (typeof value !== "string" || value.length > maximum) {
    throw new AppError(`El campo ${field} no es válido o supera el tamaño permitido.`, 400);
  }
  return value.trim();
}

function validateInput(body) {
  validateKeys(body, ["estado", "indicadores", "semana", "indicaciones", "revision"]);
  if (!["borrador", "finalizado"].includes(body.estado)) throw new AppError("El estado del plan no es válido.", 400);
  if (!Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision > 1_000_000) {
    throw new AppError("La revisión del plan no es válida.", 400);
  }
  validateKeys(body.indicadores, INDICATORS);
  const indicadores = {};
  for (const field of INDICATORS) {
    const value = boundedText(body.indicadores[field] ?? "", field === "edad" ? 3 : 12, field).replace(",", ".");
    if (value && (field === "edad"
      ? !/^\d{1,3}$/.test(value) || Number(value) < 18 || Number(value) > 130
      : !/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) <= 0)) {
      throw new AppError(`El indicador ${field} no es válido.`, 400);
    }
    indicadores[field] = value;
  }
  if (!Array.isArray(body.semana) || body.semana.length !== DAYS.length) {
    throw new AppError("El plan debe contener los siete días de la semana.", 400);
  }
  const semana = body.semana.map((day, index) => {
    validateKeys(day, ["dia", ...MEALS]);
    if (day.dia !== DAYS[index]) throw new AppError("Los días del plan no son válidos o están repetidos.", 400);
    const result = { dia: DAYS[index] };
    for (const meal of MEALS) result[meal] = boundedText(day[meal] ?? "", 1500, `${day.dia}: ${meal}`);
    return result;
  });
  const indicaciones = boundedText(body.indicaciones ?? "", 4000, "indicaciones");
  if (body.estado === "finalizado") {
    const missing = INDICATORS.filter((key) => !indicadores[key]).map((key) => `indicadores.${key}`);
    semana.forEach((day, index) => MEALS.forEach((meal) => {
      if (!day[meal]) missing.push(`semana.${index}.${meal}`);
    }));
    if (!indicaciones) missing.push("indicaciones");
    if (missing.length) {
      const error = new AppError("Completa los indicadores, las comidas y las indicaciones antes de finalizar el plan.", 422);
      error.details = { fields: missing };
      throw error;
    }
  }
  return { estado: body.estado, indicadores, semana, indicaciones };
}

function followUpDto(history, plan) {
  const form = history.datosFormulario || {};
  return {
    id: idOf(history._id), pacienteId: history.pacienteId ? idOf(history.pacienteId) : null,
    paciente: { nombre: textOf(history.paciente?.nombre), sexo: textOf(history.paciente?.sexo), celular: textOf(history.paciente?.celular) },
    indicadores: {
      edad: textOf(form.edad), peso: textOf(form.pesoClinico || form.pesoActual),
      talla: textOf(form.tallaClinica || form.talla), imc: textOf(form.imcClinico || form.imc),
    },
    fechaFinalizacion: history.finalizadaEn || null,
    planEstado: plan?.estado || "sin_plan", planId: plan ? idOf(plan._id) : null,
  };
}

function planDto(plan) {
  if (!plan) return null;
  return {
    id: idOf(plan._id), historiaClinicaId: idOf(plan.historiaClinicaId), profesionalId: idOf(plan.profesionalId),
    estado: plan.estado,
    indicadores: Object.fromEntries(INDICATORS.map((key) => [key, textOf(plan.indicadores?.[key])])),
    semana: DAYS.map((dia, index) => ({ dia, ...Object.fromEntries(MEALS.map((key) => [key, textOf(plan.semana?.[index]?.[key])])) })),
    indicaciones: textOf(plan.indicaciones), revision: plan.revision,
    finalizadoEn: plan.finalizadoEn || null, createdAt: plan.createdAt, updatedAt: plan.updatedAt,
  };
}

function createPlanAlimentarioService({ repository = defaultRepository, now = () => new Date() } = {}) {
  async function getFollowUp(historiaId) {
    const history = await repository.findFollowUp(historiaId);
    // Defense in depth: a mocked or changed repository cannot broaden this
    // handoff to old histories, drafts or the doctor's clinical aggregate.
    if (!history || history.estado !== "finalizada" || history.seguimientoAlimentarioHabilitado !== true) {
      throw new AppError("El seguimiento alimentario no está disponible.", 404);
    }
    return history;
  }

  async function list(actor) {
    const professionalId = authorize(actor);
    const histories = (await repository.listFollowUps()).filter(
      (item) => item.estado === "finalizada" && item.seguimientoAlimentarioHabilitado === true,
    );
    if (!histories.length) return { seguimientos: [] };
    const plans = await repository.findByHistoryIds(histories.map((history) => idOf(history._id)));
    const byHistory = new Map(plans.map((plan) => [idOf(plan.historiaClinicaId), plan]));
    return { seguimientos: histories.filter((history) => {
      const plan = byHistory.get(idOf(history._id));
      return !plan || idOf(plan.profesionalId) === professionalId;
    }).map((history) => followUpDto(history, byHistory.get(idOf(history._id)))) };
  }

  async function get(historiaId, actor) {
    const professionalId = authorize(actor);
    const id = requireId(historiaId);
    const plan = await repository.findByHistory(id);
    ensureOwner(plan, professionalId);
    const history = await getFollowUp(id);
    return { seguimiento: followUpDto(history, plan), plan: planDto(plan) };
  }

  async function save(historiaId, body, actor) {
    const professionalId = authorize(actor);
    const id = requireId(historiaId);
    const existing = await repository.findByHistory(id);
    ensureOwner(existing, professionalId);
    if (existing?.estado === "finalizado") throw new AppError("El plan ya fue finalizado y no puede modificarse.", 409);
    const history = await getFollowUp(id);
    const data = validateInput(body);
    if (body.revision !== (existing?.revision || 0)) throw new AppError("El plan cambió en otra sesión. Vuelve a cargarlo antes de guardar.", 409);
    data.finalizadoEn = data.estado === "finalizado" ? now() : null;
    let plan;
    if (!existing) {
      try {
        plan = await repository.create({ historiaClinicaId: id, profesionalId: professionalId, ...data, revision: 1 });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        ensureOwner(await repository.findByHistory(id), professionalId);
        throw new AppError("El plan fue creado en otra sesión. Vuelve a cargarlo antes de guardar.", 409);
      }
    } else {
      plan = await repository.updateDraft({ historiaId: id, profesionalId: professionalId, revision: body.revision, data });
      if (!plan) throw new AppError("El plan cambió en otra sesión. Vuelve a cargarlo antes de guardar.", 409);
    }
    return { seguimiento: followUpDto(history, plan), plan: planDto(plan) };
  }
  return { list, get, save };
}

module.exports = { ...createPlanAlimentarioService(), createPlanAlimentarioService, DAYS, MEALS, validateInput };
