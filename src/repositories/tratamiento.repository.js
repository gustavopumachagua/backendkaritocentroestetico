const Tratamiento = require("../models/Tratamiento.model");
const escapeRegex = require("../utils/escapeRegex");

const PROFESSIONAL_IDENTITY_FIELDS = "nombre rol";

/**
 * The treatment document deliberately keeps a display-name snapshot for older
 * clients.  Populate the authoritative references as well, so read models can
 * always prefer the current account identity after a professional renames
 * their profile.
 */
const populateProfessionalIdentity = (query) =>
  query
    .populate("profesionalId", PROFESSIONAL_IDENTITY_FIELDS)
    .populate({
      path: "cita",
      select: "profesional rol",
      populate: {
        path: "profesional",
        select: PROFESSIONAL_IDENTITY_FIELDS,
      },
    });

/**
 * Repositorio de acceso a datos para la entidad Tratamiento.
 * Encapsula todas las operaciones de Mongoose para Tratamiento.
 */

const findAll = () => {
  return populateProfessionalIdentity(Tratamiento.find()).sort({ createdAt: -1 }).lean();
};

// The daily service report needs only operational fields, not clinical notes
// or image metadata. Keeping this projection here avoids reusing the wider
// treatment list in a cross-specialty reporting screen.
const findForServiceReport = () =>
  populateProfessionalIdentity(
    Tratamiento.find().select(
      "nombre pacienteId pacienteNombresAnteriores sexo celular servicio fecha profesional profesionalId rol cita createdAt",
    ),
  ).sort({ fecha: -1 });

/**
 * Ownership is immutable. Legacy names are reconciled safely by the service
 * before this query; an ambiguous display name never grants access.
 */
function getOwnerCriteria(profesionalId, profesionalNombre, rol) {
  return { rol, profesionalId };
}

const findByOwner = (profesionalId, profesionalNombre, rol) =>
  populateProfessionalIdentity(
    Tratamiento.find(getOwnerCriteria(profesionalId, profesionalNombre, rol)),
  ).sort({ createdAt: -1 }).lean();

/**
 * Legacy treatment rows may predate `profesionalId`/`rol`, but still retain
 * the appointment that authorized the attention. Including only appointment
 * ids owned by the authenticated professional restores those rows without
 * widening access to another professional's data.
 */
const findByOwnerOrCitas = (
  profesionalId,
  profesionalNombre,
  rol,
  citaIds = [],
) => {
  const ownerCriteria = getOwnerCriteria(profesionalId, profesionalNombre, rol);
  const validCitaIds = Array.isArray(citaIds)
    ? citaIds.filter(Boolean)
    : [];

  const criteria = validCitaIds.length
    ? {
        $or: [
          ownerCriteria,
          { $and: [missingProfessionalIdCriteria(), { cita: { $in: validCitaIds } }] },
        ],
      }
    : ownerCriteria;

  return populateProfessionalIdentity(Tratamiento.find(criteria)).sort({
    createdAt: -1,
  }).lean();
};

const create = (tratamientoData) => {
  const tratamiento = new Tratamiento(tratamientoData);
  return tratamiento.save();
};

const findByNombreExactAndOwner = (
  nombre,
  profesionalId,
  profesionalNombre,
  rol,
) =>
  populateProfessionalIdentity(
    Tratamiento.findOne({
      nombre: { $regex: new RegExp(`^${nombre}$`, "i") },
      ...getOwnerCriteria(profesionalId, profesionalNombre, rol),
    }),
  ).lean();

const findById = (id) => Tratamiento.findById(id);
// Lean preserves genuinely absent legacy subdocument ids instead of inventing
// different image ids each time Mongoose hydrates an older stored array.
const findMediaById = (id) => Tratamiento.findById(id).lean();

const findByCita = (citaId) => Tratamiento.findOne({ cita: citaId });

const findByNombreAndOwner = (nombre, profesionalId, profesionalNombre, rol) => {
  const nombreEscapado = escapeRegex(nombre);

  return populateProfessionalIdentity(
    Tratamiento.findOne({
      nombre: { $regex: new RegExp(`^${nombreEscapado}$`, "i") },
      ...getOwnerCriteria(profesionalId, profesionalNombre, rol),
    }),
  ).sort({ createdAt: -1 }).lean();
};

const missingProfessionalIdCriteria = () => ({
  $or: [
    { profesionalId: { $exists: false } },
    { profesionalId: null },
  ],
});

const findLegacyProfessionalRows = () =>
  Tratamiento.find(missingProfessionalIdCriteria())
    .select("profesional rol cita")
    .lean();

const reconcileProfessionalRows = (assignments) => {
  if (!assignments.length) return Promise.resolve({ modifiedCount: 0 });

  return Tratamiento.bulkWrite(assignments.map(({ treatment, professional }) => ({
    updateOne: {
      filter: {
        $and: [
          missingProfessionalIdCriteria(),
          {
            _id: treatment._id,
            profesional: treatment.profesional,
            rol: treatment.rol,
            cita: treatment.cita || null,
          },
        ],
      },
      update: {
        $set: {
          profesionalId: professional._id,
          profesional: professional.nombre,
          rol: professional.rol,
        },
      },
    },
  })));
};

/**
 * Keeps the denormalized display fields aligned for records that already
 * belong to a professional through their immutable account id.
 */
const updateProfessionalIdentityById = (profesionalId, { nombre, rol }) =>
  Tratamiento.updateMany(
    { profesionalId },
    { $set: { profesional: nombre, rol } },
  );

/**
 * Safely adopts legacy rows through their appointment reference.  The caller
 * supplies appointment ids already constrained to the same professional.
 */
const updateLegacyProfessionalIdentityByCitas = (
  citaIds,
  profesionalId,
  { nombre, rol },
) =>
  Tratamiento.updateMany(
    {
      $and: [
        missingProfessionalIdCriteria(),
        { cita: { $in: citaIds } },
      ],
    },
    { $set: { profesionalId, profesional: nombre, rol } },
  );

/** Renames exactly the selected treatment, preserving its immutable id. */
const renamePacienteById = (id, nombreNuevo) =>
  Tratamiento.findByIdAndUpdate(id, { $set: { nombre: nombreNuevo } }, { new: true });

const restorePacienteByIdIfCurrentName = (id, currentName, originalName) =>
  Tratamiento.findOneAndUpdate(
    { _id: id, nombre: currentName },
    { $set: { nombre: originalName } },
    { new: true },
  );

/** A cita has a unique treatment link, so this resolves at most one record. */
const renamePacienteByCita = (citaId, nombreNuevo) =>
  Tratamiento.findOneAndUpdate(
    { cita: citaId },
    { $set: { nombre: nombreNuevo } },
    { new: true },
  );

const restorePacienteByCitaIfCurrentName = (
  citaId,
  currentName,
  originalName,
) =>
  Tratamiento.findOneAndUpdate(
    { cita: citaId, nombre: currentName },
    { $set: { nombre: originalName } },
    { new: true },
  );

module.exports = {
  findMediaById,
  findAll,
  findForServiceReport,
  findByOwner,
  findByOwnerOrCitas,
  create,
  findByNombreExactAndOwner,
  findById,
  findByCita,
  findByNombreAndOwner,
  renamePacienteById,
  restorePacienteByIdIfCurrentName,
  renamePacienteByCita,
  restorePacienteByCitaIfCurrentName,
  updateProfessionalIdentityById,
  findLegacyProfessionalRows,
  reconcileProfessionalRows,
  updateLegacyProfessionalIdentityByCitas,
};
