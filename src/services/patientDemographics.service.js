const defaultRepository = require("../repositories/patientDemographics.repository");
const AppError = require("../errors/AppError");
const { OBJECT_ID_REGEX, PROFESSIONAL_ROLES } = require("../constants");
const { getId, normalizePhone, normalizeSex, text } = require("../helpers/patientIdentity");

const displaySex = (value) => ({ femenino: "Femenino", masculino: "Masculino" })[normalizeSex(value)] || "";
const updatedAt = (record) => new Date(record.updatedAt || 0).getTime() || 0;

function createPatientDemographicsService({ repository = defaultRepository } = {}) {
  async function getStoredForPatient(patientId) {
    const pacienteId = getId(patientId);
    if (!OBJECT_ID_REGEX.test(pacienteId)) return { sexo: "", celular: "" };
    const records = await repository.findLatestByPatientId(pacienteId);
    // Recheck the durable relation even if a repository projection changes.
    // A name or a browser-supplied identity can never authorize these values.
    const candidates = [
      ...(records.tratamientos || []).map((record) => ({ ...record, sexo: record.sexo, celular: record.celular })),
      ...(records.historias || []).map((record) => ({ ...record, sexo: record.paciente?.sexo, celular: record.paciente?.celular })),
    ].filter((record) => getId(record.pacienteId) === pacienteId).sort((a, b) => updatedAt(b) - updatedAt(a));
    return {
      sexo: candidates.map((record) => displaySex(record.sexo)).find(Boolean) || "",
      celular: candidates.map((record) => normalizePhone(record.celular)).find(Boolean) || "",
    };
  }

  async function getByAppointment(citaId, actor) {
    if (!actor?.id || !PROFESSIONAL_ROLES.includes(actor.rol)) {
      throw new AppError("No tienes permiso para consultar los datos del paciente.", 403);
    }
    if (typeof citaId !== "string" || !OBJECT_ID_REGEX.test(citaId)) {
      throw new AppError("La cita seleccionada no es válida.", 400);
    }
    const cita = await repository.findAppointment(citaId);
    if (!cita) throw new AppError("La cita seleccionada no existe.", 404);
    if (getId(cita.profesional) !== getId(actor.id) || cita.rol !== actor.rol) {
      throw new AppError("No tienes permiso sobre la cita seleccionada.", 403);
    }
    const pacienteId = getId(cita.pacienteId) || null;
    return {
      nombre: text(cita.cliente), pacienteId,
      ...await getStoredForPatient(pacienteId),
    };
  }

  return { getByAppointment, getStoredForPatient };
}

module.exports = { ...createPatientDemographicsService(), createPatientDemographicsService };
