const mediaAdapter = require("./cloudinaryMedia.adapter");
const tratamientoRepository = require("../repositories/tratamiento.repository");
const citaRepository = require("../repositories/cita.repository");
const professionalIdentityService = require("./professionalIdentity.service");
const patientIdentityService = require("./patientIdentity.service");
const { getId: getRecordId } = require("../helpers/patientIdentity");
const { buildAttentionHistory } = require("../helpers/attentionHistory");
const escapeRegex = require("../utils/escapeRegex");
const { deleteLocalFile } = require("../helpers/fileHelper");
const AppError = require("../errors/AppError");
const { OBJECT_ID_REGEX, PROFESSIONAL_ROLES } = require("../constants");

/**
 * Servicio de lógica de negocio para Tratamientos.
 */

// ─── Helpers privados ────────────────────────────────────────────────────────

function isSameId(first, second) {
  return String(getRecordId(first)) === String(getRecordId(second));
}

function asPlainRecord(record) {
  if (record && typeof record.toObject === "function") {
    return record.toObject();
  }

  return record;
}

function getProfessionalIdentity(record) {
  const directProfessional = record?.profesionalId;
  if (
    directProfessional &&
    typeof directProfessional === "object" &&
    String(directProfessional.nombre || "").trim()
  ) {
    return directProfessional;
  }

  const appointmentProfessional = record?.cita?.profesional;
  if (
    appointmentProfessional &&
    typeof appointmentProfessional === "object" &&
    String(appointmentProfessional.nombre || "").trim()
  ) {
    return appointmentProfessional;
  }

  return null;
}

/**
 * `profesional` was historically a stored display name. The immutable user
 * reference is now authoritative, so shape every read with its current name
 * before it reaches reports or history screens. This also heals stale rows
 * created before the persistence migration runs.
 */
function presentTreatment(record, fallbackProfessional = null) {
  const treatment = asPlainRecord(record);
  if (!treatment) return treatment;

  const professional = getProfessionalIdentity(treatment) || fallbackProfessional;
  const currentName = String(professional?.nombre || "").trim();
  if (!currentName) return treatment;

  const professionalId = getRecordId(treatment.profesionalId) ||
    getRecordId(treatment.cita?.profesional) ||
    getRecordId(fallbackProfessional);

  return {
    ...treatment,
    profesional: currentName,
    rol: professional?.rol || treatment.rol,
    ...(professionalId ? { profesionalId: professionalId } : {}),
  };
}

function presentTreatments(records, fallbackProfessional = null) {
  return Array.isArray(records)
    ? records.map((record) => presentTreatment(record, fallbackProfessional))
    : [];
}

function assertTreatmentActor(actor) {
  if (!actor?.id || !PROFESSIONAL_ROLES.includes(actor.rol)) {
    throw new AppError("No tienes permiso para registrar tratamientos.", 403);
  }
}

async function subirImagenes(files) {
  const imagenesSubidas = [];

  for (const file of files) {
    try {
      const asset = await mediaAdapter.uploadImage(file, {
        folder: "tratamientos",
        transformation: [
          {
            width: 1600,
            height: 1600,
            crop: "limit",
            quality: "auto:good",
          },
        ],
      });

      imagenesSubidas.push({
        // Only the persisted treatment id authorizes the eventual delivery URL.
        url: "", thumbnailUrl: "", public_id: asset.public_id, asset,
      });
    } finally {
      deleteLocalFile(file.path);
    }
  }

  return imagenesSubidas;
}

// ─── Operaciones públicas ────────────────────────────────────────────────────

const crearTratamiento = async (data, files, actor) => {
  assertTreatmentActor(actor);
  const {
    nombre,
    sexo,
    celular,
    servicio,
    fecha,
    observacion,
    insumos,
    citaId,
  } = data;

  const serviciosArray =
    typeof servicio === "string" ? servicio.split(",") : servicio;
  const insumosArray =
    typeof insumos === "string" ? insumos.split(",") : insumos;

  if (citaId && !OBJECT_ID_REGEX.test(citaId)) {
    throw new AppError("La cita seleccionada no es válida.", 400);
  }

  let citaReservada = null;
  if (citaId) {
    const cita = await citaRepository.findById(citaId);
    if (!cita) {
      throw new AppError("La cita seleccionada no existe.", 404);
    }

    if (!isSameId(cita.profesional, actor.id)) {
      throw new AppError("No tienes permiso sobre la cita seleccionada.", 403);
    }

    citaReservada = await citaRepository.marcarComoAtendidaSiPendientePorProfesional(
      citaId,
      actor.id,
    );

    if (!citaReservada) {
      throw new AppError(
        "La cita ya fue atendida o no está disponible para registrar un tratamiento.",
        409,
      );
    }
  }

  let assignedPatientId = null;
  let treatmentCreated = false;
  const identityGuard = citaReservada ? {
    profesional: citaReservada.profesional,
    cliente: citaReservada.cliente,
    estado: citaReservada.estado,
  } : null;
  try {
    const patientIdentity = await patientIdentityService.resolvePatientForRegistration({
      nombre, celular, sexo, cita: citaReservada,
    });
    if (citaReservada && patientIdentity.pacienteId && !citaReservada.pacienteId) {
      const assigned = await citaRepository.assignPacienteIdIfMissing(
        citaReservada._id, patientIdentity.pacienteId, identityGuard,
      );
      if (!assigned) {
        throw new AppError("La cita cambió en otra sesión. Vuelve a seleccionarla.", 409);
      }
      assignedPatientId = patientIdentity.pacienteId;
    }
    let imagenesSubidas = [];
    if (files && files.length > 0) {
      imagenesSubidas = await subirImagenes(files);
    }

    const nuevoTratamiento = await tratamientoRepository.create({
      nombre: patientIdentity.nombre,
      pacienteId: patientIdentity.pacienteId,
      sexo,
      celular,
      servicio: serviciosArray,
      fecha,
      observacion,
      insumos: insumosArray,
      profesionalId: actor.id,
      profesional: actor.nombre,
      rol: actor.rol,
      cita: citaReservada?._id,
      imagenes: imagenesSubidas,
    });
    treatmentCreated = true;

    if (!citaReservada) {
      // Legacy manual registrations can still mark their own matching
      // appointment as attended, but never an appointment of another user.
      await citaRepository.marcarComoAtendidaPorClienteFechaYProfesional(
        nombre,
        fecha,
        actor.id,
      );
    }

    return nuevoTratamiento;
  } catch (error) {
    if (assignedPatientId && !treatmentCreated) {
      const existingTreatment = error?.code === 11000
        ? await tratamientoRepository.findByCita(citaReservada._id)
        : null;
      if (!existingTreatment || !isSameId(existingTreatment.pacienteId, assignedPatientId)) {
        await citaRepository.clearPacienteIdIfCurrent(citaReservada._id, assignedPatientId, identityGuard);
      }
    }
    if (citaReservada && !treatmentCreated && error?.code !== 11000) {
      await citaRepository.restaurarComoPendiente(citaReservada._id);
    }

    if (error?.code === 11000) {
      throw new AppError("Ya existe un tratamiento para esta cita.", 409);
    }

    throw error;
  }
};

const obtenerTratamientos = async (actor) => {
  if (!actor?.id || !["administrador", ...PROFESSIONAL_ROLES].includes(actor.rol)) {
    throw new AppError("No autorizado", 403);
  }

  await professionalIdentityService.reconciliarIdentidadesProfesionales();

  if (actor.rol === "administrador") {
    const treatments = await tratamientoRepository.findAll();
    return presentTreatments(treatments);
  }

  // Current records carry `profesionalId`, while older treatments may only
  // be tied to the appointment that the professional attended. Resolve those
  // cita ids server-side; this preserves the authorization boundary instead
  // of exposing the administrator's complete report to a cosmiatra.
  const citasPropias = await citaRepository.findByProfesional(actor.id);
  const citaIds = Array.isArray(citasPropias)
    ? citasPropias.map((cita) => cita?._id).filter(Boolean)
    : [];

  const treatments = await tratamientoRepository.findByOwnerOrCitas(
    actor.id,
    actor.nombre,
    actor.rol,
    citaIds,
  );

  // The repository query is already constrained to this authenticated
  // professional. The fallback only helps an unlinked legacy row while its
  // identity migration is being completed.
  return presentTreatments(treatments, actor);
};

/** Operational attentions, including attended citas without clinical notes. */
const obtenerHistorialAtenciones = async (actor) => {
  if (!actor?.id || !["administrador", ...PROFESSIONAL_ROLES].includes(actor.rol)) {
    throw new AppError("No autorizado", 403);
  }
  const [tratamientos, citas] = await Promise.all([
    obtenerTratamientos(actor),
    citaRepository.findAttendedForHistory(actor.rol === "administrador"
      ? {} : { professionalId: actor.id }),
  ]);
  return buildAttentionHistory({ tratamientos, citas });
};

/**
 * Operational daily report shared by administration and reception.
 * It intentionally returns a minimal projection from the repository and is
 * separate from the professional's clinical-history list, which remains
 * limited to the authenticated owner's treatments.
 */
const obtenerTratamientosParaReporteServicios = async (actor) => {
  if (!actor?.id || !["administrador", "cosmiatra"].includes(actor.rol)) {
    throw new AppError("No tienes permiso para consultar este reporte.", 403);
  }

  await professionalIdentityService.reconciliarIdentidadesProfesionales();

  const [treatments, citas] = await Promise.all([
    tratamientoRepository.findForServiceReport(),
    citaRepository.findAttendedForHistory(),
  ]);
  // Persisted aliases support conservative legacy matching internally; the
  // shared operational report does not need to expose the patient's aliases.
  return buildAttentionHistory({ tratamientos: presentTreatments(treatments), citas })
    .map(({ pacienteNombresAnteriores, ...record }) => record);
};

/**
 * Propagates a profile rename to operational rows. New rows are joined by the
 * immutable professional id; older rows are recovered from appointments owned
 * by that id. Editable names and aliases never grant ownership of an
 * unlinked legacy row during an ordinary profile update.
 */
const sincronizarIdentidadProfesional = async ({
  user,
}) => {
  const rol = String(user?.rol || "").trim().toLowerCase();
  const profesionalId = getRecordId(user);
  const nombre = String(user?.nombre || "").trim();

  if (!PROFESSIONAL_ROLES.includes(rol) || !profesionalId || !nombre) {
    return {
      byProfessionalId: null,
      byAppointments: null,
      reconciliation: null,
    };
  }

  const [byProfessionalId, appointments] = await Promise.all([
    tratamientoRepository.updateProfessionalIdentityById(profesionalId, {
      nombre,
      rol,
    }),
    citaRepository.findByProfesional(profesionalId),
  ]);

  const citaIds = Array.isArray(appointments)
    ? appointments.map((cita) => getRecordId(cita)).filter(Boolean)
    : [];
  const appointmentMigration = citaIds.length
    ? tratamientoRepository.updateLegacyProfessionalIdentityByCitas(
        citaIds,
        profesionalId,
        { nombre, rol },
      )
    : Promise.resolve(null);

  const byAppointments = await appointmentMigration;
  const reconciliation = await professionalIdentityService.reconciliarIdentidadesProfesionales();

  return { byProfessionalId, byAppointments, reconciliation };
};

const buscarPaciente = async (nombre, actor) => {
  assertTreatmentActor(actor);
  await professionalIdentityService.reconciliarIdentidadesProfesionales();
  const nombreLimpio = String(nombre || "").trim().slice(0, 80);
  const escapedNombre = escapeRegex(nombreLimpio);

  const tratamiento = await tratamientoRepository.findByNombreExactAndOwner(
    escapedNombre,
    actor.id,
    actor.nombre,
    actor.rol,
  );

  if (!tratamiento) {
    throw new AppError("Paciente no encontrado", 404);
  }

  return {
    nombre: tratamiento.nombre,
    pacienteId: tratamiento.pacienteId || null,
    sexo: tratamiento.sexo,
    celular: tratamiento.celular,
  };
};

module.exports = {
  crearTratamiento,
  obtenerTratamientos,
  obtenerHistorialAtenciones,
  obtenerTratamientosParaReporteServicios,
  buscarPaciente,
  sincronizarIdentidadProfesional,
};
