const Cita = require("../models/Cita.model");
const escapeRegex = require("../utils/escapeRegex");
const {
  PROFESIONAL_FIELDS,
  PROFESIONAL_FIELDS_MINIMAL,
  ESTADO_CITA_ATENDIDO,
  ESTADO_CITA_PENDIENTE,
} = require("../constants");

/**
 * Repositorio de acceso a datos para la entidad Cita.
 * Encapsula todas las operaciones de Mongoose para Cita.
 */

const findAll = () => {
  return Cita.find()
    .populate("profesional", PROFESIONAL_FIELDS)
    .sort({ fecha: -1 });
};

const findByProfesional = (profesionalId) => {
  return Cita.find({ profesional: profesionalId })
    .populate("profesional", PROFESIONAL_FIELDS)
    .sort({ fecha: -1 });
};

// Attention histories and shared service reports need only operational
// appointment metadata, never the broader professional profile projection.
const findAttendedForHistory = ({ professionalId } = {}) =>
  Cita.find({
    estado: ESTADO_CITA_ATENDIDO,
    ...(professionalId ? { profesional: professionalId } : {}),
  })
    .select("cliente pacienteId rol profesional servicio fecha estado")
    .populate("profesional", PROFESIONAL_FIELDS_MINIMAL)
    .sort({ fecha: -1 })
    .lean();

const findById = (id) => {
  return Cita.findById(id);
};

const assignPacienteIdIfMissing = (id, pacienteId, guard = {}) => Cita.findOneAndUpdate(
  { _id: id, ...guard, $or: [{ pacienteId: { $exists: false } }, { pacienteId: null }] },
  { $set: { pacienteId } },
  { new: true, runValidators: true },
);

const clearPacienteIdIfCurrent = (id, pacienteId, guard = {}) => Cita.updateOne(
  { _id: id, pacienteId, ...guard },
  { $unset: { pacienteId: 1 } },
);

const findProfessionalReferencesByIds = (ids) =>
  Cita.find({ _id: { $in: ids } }).select("profesional").lean();

const findByClienteAndProfesional = (cliente, profesionalId) => {
  const clienteEscapado = escapeRegex(cliente);

  return Cita.findOne({
    cliente: { $regex: new RegExp(`^${clienteEscapado}$`, "i") },
    profesional: profesionalId,
  }).sort({ fecha: -1 });
};

/**
 * Renames only the appointment selected by its immutable id. A name alone is
 * not a safe patient identifier, so historical appointments are never bulk
 * renamed by a text match.
 */
const renameClienteById = (id, nombreNuevo) =>
  Cita.findByIdAndUpdate(id, { $set: { cliente: nombreNuevo } }, { new: true })
    .populate("profesional", PROFESIONAL_FIELDS);

const restoreClienteIfCurrentName = (id, currentName, originalName) =>
  Cita.findOneAndUpdate(
    { _id: id, cliente: currentName },
    { $set: { cliente: originalName } },
    { new: true },
  ).populate("profesional", PROFESIONAL_FIELDS);

const findByIdPopulated = (id, fields = PROFESIONAL_FIELDS) => {
  return Cita.findById(id).populate("profesional", fields);
};

const findByIdempotencyKey = (idempotencyKey) => {
  return Cita.findOne({ idempotencyKey });
};

const create = (citaData) => {
  const cita = new Cita(citaData);
  return cita.save();
};

const save = (citaDoc) => {
  return citaDoc.save();
};

const deleteById = (id) => {
  return Cita.findByIdAndDelete(id);
};

const searchByClientName = (regexPattern, limit = 10) => {
  return Cita.find({
    cliente: { $regex: regexPattern, $options: "i" },
  }).limit(limit);
};

const searchByClientNameAndProfesional = (
  regexPattern,
  profesionalId,
  limit = 10,
) => {
  return Cita.find({
    cliente: { $regex: regexPattern, $options: "i" },
    profesional: profesionalId,
  }).limit(limit);
};

const marcarComoAtendidaPorClienteFechaYProfesional = (
  cliente,
  fecha,
  profesionalId,
) => {
  return Cita.findOneAndUpdate(
    {
      cliente,
      fecha,
      profesional: profesionalId,
      estado: ESTADO_CITA_PENDIENTE,
    },
    { estado: ESTADO_CITA_ATENDIDO },
  );
};

const marcarComoAtendidaSiPendiente = (id) => {
  return Cita.findOneAndUpdate(
    { _id: id, estado: ESTADO_CITA_PENDIENTE },
    { estado: ESTADO_CITA_ATENDIDO },
    { new: true },
  );
};

const marcarComoAtendidaSiPendientePorProfesional = (id, profesionalId) => {
  return Cita.findOneAndUpdate(
    {
      _id: id,
      profesional: profesionalId,
      estado: ESTADO_CITA_PENDIENTE,
    },
    { estado: ESTADO_CITA_ATENDIDO },
    { new: true },
  );
};

const restaurarComoPendiente = (id) => {
  return Cita.findOneAndUpdate(
    { _id: id, estado: ESTADO_CITA_ATENDIDO },
    { estado: ESTADO_CITA_PENDIENTE },
  );
};

module.exports = {
  findAll,
  findByProfesional,
  findAttendedForHistory,
  findById,
  assignPacienteIdIfMissing,
  clearPacienteIdIfCurrent,
  findProfessionalReferencesByIds,
  findByClienteAndProfesional,
  renameClienteById,
  restoreClienteIfCurrentName,
  findByIdPopulated,
  findByIdempotencyKey,
  create,
  save,
  deleteById,
  searchByClientName,
  searchByClientNameAndProfesional,
  marcarComoAtendidaPorClienteFechaYProfesional,
  marcarComoAtendidaSiPendiente,
  marcarComoAtendidaSiPendientePorProfesional,
  restaurarComoPendiente,
};
