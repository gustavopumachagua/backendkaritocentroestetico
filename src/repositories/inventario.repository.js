const Inventario = require("../models/Inventario.model");

/**
 * Repositorio de acceso a datos para la entidad Inventario.
 * Encapsula todas las operaciones de Mongoose para Inventario.
 */

const findByRol = (rol) => {
  return Inventario.find({ rol });
};

const findById = (id) => {
  return Inventario.findById(id);
};

const findByRolTipoNombre = (rol, tipo, nombre) => {
  return Inventario.findOne({ rol, tipo, nombre });
};

const findByRolAndNombre = (rol, nombre) => {
  return Inventario.findOne({ rol, nombre });
};

const create = (itemData) => {
  const item = new Inventario(itemData);
  return item.save();
};

const save = (itemDoc) => {
  return itemDoc.save();
};

const deleteById = (id) => {
  return Inventario.findByIdAndDelete(id);
};

module.exports = {
  findByRol,
  findById,
  findByRolTipoNombre,
  findByRolAndNombre,
  create,
  save,
  deleteById,
};
