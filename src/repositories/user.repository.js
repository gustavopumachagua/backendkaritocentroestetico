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
  }).select("nombre rol avatar");
};

const findProfessionalIdentities = () =>
  User.find({ rol: { $in: ["doctor", "cosmiatra"] } })
    .select("nombre rol activo +nombresAnteriores")
    .lean();

const addPreviousProfessionalNames = (assignments) => {
  if (!assignments.length) return Promise.resolve({ modifiedCount: 0 });

  return User.bulkWrite(assignments.map(({ professionalId, rol, names }) => ({
    updateOne: {
      filter: { _id: professionalId, rol },
      update: { $addToSet: { nombresAnteriores: { $each: names } } },
    },
  })));
};

const findByNombreAndRol = (nombre, rol) => {
  return User.findOne({ nombre, rol });
};

const countByNombreAndRol = (nombre, rol) => {
  return User.countDocuments({ nombre, rol });
};

const create = (userData) => {
  const user = new User(userData);
  return user.save();
};

const updateById = (id, updateData) => {
  return User.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
};

const updateProfileById = (id, updateData, previousName = "") =>
  User.findByIdAndUpdate(id, {
    $set: updateData,
    ...(previousName ? { $addToSet: { nombresAnteriores: previousName } } : {}),
  }, { new: true, runValidators: true });

const deleteById = (id) => {
  return User.findByIdAndDelete(id);
};

const save = (user) => user.save();

module.exports = {
  findByEmail,
  findById,
  findAll,
  findProfesionales,
  findProfessionalIdentities,
  addPreviousProfessionalNames,
  findByNombreAndRol,
  countByNombreAndRol,
  create,
  updateById,
  updateProfileById,
  deleteById,
  save,
};
