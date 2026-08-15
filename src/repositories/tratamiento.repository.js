const Tratamiento = require("../models/Tratamiento.model");

/**
 * Repositorio de acceso a datos para la entidad Tratamiento.
 * Encapsula todas las operaciones de Mongoose para Tratamiento.
 */

const findAll = () => {
  return Tratamiento.find().sort({ createdAt: -1 });
};

const create = (tratamientoData) => {
  const tratamiento = new Tratamiento(tratamientoData);
  return tratamiento.save();
};

const findByNombreExact = (nombre) => {
  return Tratamiento.findOne({
    nombre: { $regex: new RegExp(`^${nombre}$`, "i") },
  });
};

module.exports = {
  findAll,
  create,
  findByNombreExact,
};
