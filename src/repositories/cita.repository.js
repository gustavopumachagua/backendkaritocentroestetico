const Cita = require("../models/Cita.model");
const { PROFESIONAL_FIELDS, PROFESIONAL_FIELDS_MINIMAL } = require("../constants");

/**
 * Repositorio de acceso a datos para la entidad Cita.
 * Encapsula todas las operaciones de Mongoose para Cita.
 */

const findAll = () => {
  return Cita.find()
    .populate("profesional", PROFESIONAL_FIELDS)
    .sort({ fecha: -1 });
};

const findById = (id) => {
  return Cita.findById(id);
};

const findByIdPopulated = (id, fields = PROFESIONAL_FIELDS) => {
  return Cita.findById(id).populate("profesional", fields);
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

const findByClienteAndFecha = (cliente, fecha) => {
  return Cita.findOneAndUpdate(
    { cliente, fecha },
    { estado: "atendido" },
  );
};

module.exports = {
  findAll,
  findById,
  findByIdPopulated,
  create,
  save,
  deleteById,
  searchByClientName,
  findByClienteAndFecha,
};
