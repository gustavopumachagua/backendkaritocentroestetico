const Pago = require("../models/Pago.model");

/**
 * Repositorio de acceso a datos para la entidad Pago.
 * Encapsula todas las operaciones de Mongoose para Pago.
 */

const findAll = () => {
  return Pago.find()
    .populate({
      path: "cita",
      select: "cliente pacienteId fecha estado profesional",
      populate: {
        path: "profesional",
        select: "nombre rol",
      },
    })
    .sort({ fecha: -1 });
};

const findByCita = (citaId) => {
  return Pago.find({ cita: citaId });
};

const findByCitas = (citaIds) => {
  return Pago.find({ cita: { $in: citaIds } })
    .populate({
      path: "cita",
      select: "cliente pacienteId fecha estado profesional",
      populate: {
        path: "profesional",
        select: "nombre rol",
      },
    })
    .sort({ fecha: -1 });
};

const findOneByCita = (citaId) => {
  return Pago.findOne({ cita: citaId });
};

const findLastByBoleta = () => {
  return Pago.findOne().sort({ numeroBoleta: -1 });
};

const create = (pagoData) => {
  const pago = new Pago(pagoData);
  return pago.save();
};

module.exports = {
  findAll,
  findByCita,
  findByCitas,
  findOneByCita,
  findLastByBoleta,
  create,
};
