const Cita = require("../models/Cita.model");
const Tratamiento = require("../models/Tratamiento.model");
const HistoriaClinica = require("../models/HistoriaClinica.model");

const findAppointment = (id) => Cita.findById(id)
  .select("cliente pacienteId profesional rol").lean();

function latestField(Model, pacienteId, field, projection) {
  return Model.findOne({ pacienteId, [field]: { $type: "string", $regex: /\S/ } })
    .select(projection).sort({ updatedAt: -1, _id: -1 }).lean();
}

/**
 * Shared intake data is resolved only by an already verified patient id.
 * Each bounded query excludes notes, diagnoses, documents, images and DNI.
 * Independent field queries retain an older value when a later draft is blank.
 */
async function findLatestByPatientId(pacienteId) {
  const treatmentProjection = "pacienteId sexo celular updatedAt";
  const historyProjection = "pacienteId paciente.sexo paciente.celular updatedAt";
  const records = await Promise.all([
    latestField(Tratamiento, pacienteId, "sexo", treatmentProjection),
    latestField(Tratamiento, pacienteId, "celular", treatmentProjection),
    latestField(HistoriaClinica, pacienteId, "paciente.sexo", historyProjection),
    latestField(HistoriaClinica, pacienteId, "paciente.celular", historyProjection),
  ]);
  return {
    tratamientos: records.slice(0, 2).filter(Boolean),
    historias: records.slice(2).filter(Boolean),
  };
}

module.exports = { findAppointment, findLatestByPatientId };
