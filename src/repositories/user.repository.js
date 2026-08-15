const User = require("../models/User.model");

/**
 * Repositorio de acceso a datos para la entidad Usuario.
 * Encapsula todas las operaciones de Mongoose para User.
 */

const findByEmail = (email) => {
  return User.findOne({ email });
};

const findById = (id, selectFields) => {
  const query = User.findById(id);
  return selectFields ? query.select(selectFields) : query;
};

const findAll = () => {
  return User.find().select("-password");
};

const findProfesionales = () => {
  return User.find({
    rol: { $in: ["doctor", "cosmiatra"] },
    activo: true,
  }).select("-password");
};

const findByNombreAndRol = (nombre, rol) => {
  return User.findOne({ nombre, rol });
};

const create = (userData) => {
  const user = new User(userData);
  return user.save();
};

const updateById = (id, updateData) => {
  return User.findByIdAndUpdate(id, updateData, { new: true });
};

const deleteById = (id) => {
  return User.findByIdAndDelete(id);
};

module.exports = {
  findByEmail,
  findById,
  findAll,
  findProfesionales,
  findByNombreAndRol,
  create,
  updateById,
  deleteById,
};
