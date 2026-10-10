const HistoriaClinica = require("../models/HistoriaClinica.model");

/**
 * Repositorio de Historias Clínicas.
 * Toda interacción con Mongoose para este agregado queda aislada aquí.
 */

const findById = (id) => HistoriaClinica.findById(id);

const findByIdAndMedico = (id, medicoId) =>
  HistoriaClinica.findOne({ _id: id, medico: medicoId });

const findByCita = (citaId) => HistoriaClinica.findOne({ cita: citaId });

const findByTratamiento = (tratamientoId) =>
  HistoriaClinica.findOne({ tratamiento: tratamientoId });

const findByMedicoAndClavePaciente = (medicoId, clavePaciente) =>
  HistoriaClinica.findOne({ medico: medicoId, clavePaciente });

const findFinalizadasByMedico = (medicoId) =>
  HistoriaClinica.find({ medico: medicoId, estado: "finalizada" })
    .sort({ finalizadaEn: -1 })
    .populate("medico", "nombre cmp firmaDigital")
    .lean();

const getLimaCalendarDayStart = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const getPart = (type) => parts.find((part) => part.type === type)?.value;

  return new Date(
    Date.UTC(Number(getPart("year")), Number(getPart("month")) - 1, Number(getPart("day"))),
  );
};

const findFinalizadasConProximoControl = () =>
  HistoriaClinica.find({
    estado: "finalizada",
    proximoControl: { $gte: getLimaCalendarDayStart() },
  })
    .select("cita paciente proximoControl medico finalizadaEn createdAt updatedAt")
    .populate("medico", "nombre")
    .populate("cita", "cliente servicio fecha")
    .sort({ proximoControl: 1 })
    .lean();

/**
 * Keeps the professional identity printed in each clinical document in sync
 * with the doctor's approved profile.  The query is deliberately scoped by
 * the immutable `medico` reference and only updates document metadata; no
 * patient or clinical-answer fields are touched.
 */
const updateDoctorMetadata = (medicoId, { nombre, cmp, firmaDigital }) =>
  HistoriaClinica.updateMany(
    { medico: medicoId },
    {
      $set: {
        "firmaMedico.nombre": nombre,
        "firmaMedico.cmp": cmp,
        "firmaMedico.url": firmaDigital,
        "datosFormulario.medicoTratante": nombre,
        "datosFormulario.nombreFirmaMedico": nombre,
        "datosFormulario.cmpConstancia": cmp,
      },
    },
    { runValidators: true },
  );

const create = (data) => new HistoriaClinica(data).save();

const save = (historia) => historia.save();

module.exports = {
  findById,
  findByIdAndMedico,
  findByCita,
  findByTratamiento,
  findByMedicoAndClavePaciente,
  findFinalizadasByMedico,
  findFinalizadasConProximoControl,
  updateDoctorMetadata,
  create,
  save,
};
