const Servicio = require("../models/Servicio.model");

/**
 * Repositorio de acceso a datos para la entidad Servicio.
 * Encapsula todas las operaciones de Mongoose para Servicio.
 */

const findByRolAndNombres = (rol, nombres) => {
  return Servicio.find({
    rol,
    nombre: { $in: nombres },
  }).select("nombre");
};

module.exports = {
  findByRolAndNombres,
};
