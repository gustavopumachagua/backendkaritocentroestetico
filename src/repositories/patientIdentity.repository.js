const Cita = require("../models/Cita.model");
const Tratamiento = require("../models/Tratamiento.model");
const Pago = require("../models/Pago.model");
const HistoriaClinica = require("../models/HistoriaClinica.model");
const escapeRegex = require("../utils/escapeRegex");

const MODELS = { cita: Cita, tratamiento: Tratamiento, pago: Pago, historia: HistoriaClinica };

function nameCriteria(field, names) {
  return names.filter(Boolean).map((name) => ({
    [field]: { $regex: new RegExp(`^${escapeRegex(String(name).trim()).replace(/\s+/g, "\\s+")}$`, "i") },
  }));
}

/** Only identity projections are read; clinical answers never leave this repository. */
async function findCandidates({ names = [], pacienteId, citaIds = [], treatmentIds = [] }) {
  const patientCriteria = pacienteId ? [{ pacienteId }] : [];
  const treatmentCriteria = [
    ...patientCriteria,
    ...nameCriteria("nombre", names),
    ...nameCriteria("pacienteNombresAnteriores", names),
    ...(treatmentIds.length ? [{ _id: { $in: treatmentIds } }] : []),
    ...(citaIds.length ? [{ cita: { $in: citaIds } }] : []),
  ];
  const historyCriteria = [
    ...patientCriteria,
    ...nameCriteria("paciente.nombre", names),
    ...nameCriteria("pacienteNombresAnteriores", names),
    ...(treatmentIds.length ? [{ tratamiento: { $in: treatmentIds } }] : []),
    ...(citaIds.length ? [{ cita: { $in: citaIds } }] : []),
  ];
  const [tratamientos, historias] = await Promise.all([
    treatmentCriteria.length ? Tratamiento.find({ $or: treatmentCriteria }).select(
      "nombre celular sexo pacienteId pacienteDni pacienteNombresAnteriores cita profesionalId rol fecha servicio",
    ).lean() : [],
    historyCriteria.length ? HistoriaClinica.find({ $or: historyCriteria }).select(
      "pacienteId pacienteNombresAnteriores paciente cita tratamiento medico datosFormulario.nombreCompleto datosFormulario.telefono datosFormulario.dni",
    ).lean() : [],
  ]);
  const linkedCitaIds = [...new Set([
    ...citaIds, ...tratamientos.map((record) => record.cita), ...historias.map((record) => record.cita),
  ].filter(Boolean).map(String))];
  const citaCriteria = [
    ...patientCriteria,
    ...nameCriteria("cliente", names),
    ...(linkedCitaIds.length ? [{ _id: { $in: linkedCitaIds } }] : []),
  ];
  const citas = citaCriteria.length ? await Cita.find({ $or: citaCriteria })
    .select("cliente pacienteId profesional rol fecha servicio estado").lean() : [];
  const allCitaIds = citas.map((record) => record._id);
  const paymentCriteria = [...patientCriteria, ...(allCitaIds.length ? [{ cita: { $in: allCitaIds } }] : [])];
  const pagos = paymentCriteria.length ? await Pago.find({ $or: paymentCriteria })
    .select("cliente pacienteId cita").lean() : [];
  return { citas, tratamientos, historias, pagos };
}

function criteriaFromFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([field, value]) => [
    field, value === undefined ? { $exists: false } : value,
  ]));
}

const applyMutation = ({ type, id, previous, next, guard = {} }) => MODELS[type].findOneAndUpdate(
  { _id: id, ...criteriaFromFields(previous), ...criteriaFromFields(guard) },
  { $set: next },
  { new: true, runValidators: true },
).lean();

/** Compensate only values written by this request, preserving concurrent edits. */
const restoreMutation = ({ type, id, previous, next }) => {
  const $set = {};
  const $unset = {};
  for (const [field, value] of Object.entries(previous)) {
    if (value === undefined) $unset[field] = 1;
    else $set[field] = value;
  }
  return MODELS[type].updateOne(
    { _id: id, ...criteriaFromFields(next) },
    { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
  );
};

module.exports = { findCandidates, applyMutation, restoreMutation };
