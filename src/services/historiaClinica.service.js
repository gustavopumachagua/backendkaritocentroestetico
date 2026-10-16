const historiaClinicaRepository = require("../repositories/historiaClinica.repository");
const citaRepository = require("../repositories/cita.repository");
const tratamientoRepository = require("../repositories/tratamiento.repository");
const userRepository = require("../repositories/user.repository");
const professionalIdentityService = require("./professionalIdentity.service");
const patientIdentityService = require("./patientIdentity.service");
const { getId, normalizePhone } = require("../helpers/patientIdentity");
const AppError = require("../errors/AppError");
const { OBJECT_ID_REGEX } = require("../constants");
const {
  getPayloadValidationErrors,
  getMissingFinalizationSections,
} = require("../helpers/clinicalHistoryValidator");
const {
  buildClinicalHistoryIdentityKey,
} = require("../helpers/clinicalHistoryIdentity");

const DOCTOR_FIELDS = "nombre rol cmp firmaDigital firmaDigitalAsset";

function valueToText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizePatientKey(value) {
  return valueToText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isSameId(first, second) {
  return getId(first) === getId(second);
}

function ensureObjectId(value, fieldName) {
  const id = getId(value);
  if (!OBJECT_ID_REGEX.test(id)) {
    throw new AppError(`${fieldName} no es válido.`, 400);
  }
  return id;
}

function normalizeStatus(status) {
  const normalized = valueToText(status).toLowerCase();
  if (!normalized || ["draft", "borrador"].includes(normalized)) {
    return "borrador";
  }

  if (["finalized", "finalizada", "completed", "completada"].includes(normalized)) {
    return "finalizada";
  }

  throw new AppError("El estado de la historia clínica no es válido.", 400);
}

function toUtcDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cloneFormData(formData) {
  return JSON.parse(JSON.stringify(formData));
}

function getPacienteInput(paciente) {
  if (!paciente || typeof paciente !== "object" || Array.isArray(paciente)) {
    return {};
  }
  return paciente;
}

function getHistoryPatientName(history) {
  return valueToText(
    history?.paciente?.nombre || history?.datosFormulario?.nombreCompleto,
  );
}

function getHistoryPatientPhone(history) {
  return normalizePhone(
    history?.paciente?.celular || history?.datosFormulario?.telefono,
  );
}

/**
 * A completed peptide history belongs to the patient, not to a subsequent
 * appointment. Appointments and treatments have different immutable ids, so
 * a returning patient cannot be found through the newer id alone.
 *
 * We only use this read-only fallback after validating ownership of the new
 * source. It requires the same doctor, normalized full name and a nonempty
 * normalized phone number. Without that phone, the current appointment keeps
 * its independent, per-cita history instead of exposing a homonymous
 * patient's document.
 */
async function findCompletedHistoryForReturningPatient({
  doctorId,
  identity,
  paciente,
  patientPhone,
}) {
  const patientName = normalizePatientKey(identity?.patientName);
  if (!patientName) return null;

  const patientId = getId(identity.tratamiento?.pacienteId || identity.cita?.pacienteId);
  if (patientId) {
    const histories = await historiaClinicaRepository.findFinalizadasByMedico(doctorId);
    const byPatientId = histories.find((history) => getId(history.pacienteId) === patientId);
    if (byPatientId) return byPatientId;
  }

  const sourcePatient = getPacienteInput(paciente);
  const resolvedTreatmentPhone = normalizePhone(identity?.tratamiento?.celular);
  const sourcePhone =
    resolvedTreatmentPhone ||
    normalizePhone(
      patientPhone || sourcePatient.celular || sourcePatient.telefono,
    );
  // There is no immutable patient entity in the current schema. Do not
  // substitute a name-only match for that missing identity: a later
  // appointment without a phone remains independent rather than risking a
  // homonymous patient's finalized clinical document.
  if (!sourcePhone) return null;

  const histories = await historiaClinicaRepository.findFinalizadasByMedico(
    doctorId,
  );
  const matchingHistories = (Array.isArray(histories) ? histories : []).filter(
    (history) => {
      if (patientId && history.pacienteId && getId(history.pacienteId) !== patientId) return false;
      if (normalizePatientKey(getHistoryPatientName(history)) !== patientName) {
        return false;
      }

      return getHistoryPatientPhone(history) === sourcePhone;
    },
  );

  // Histories are ordered newest first by the repository. The same verified
  // patient can have legacy finalized documents; reopen the newest one
  // read-only without reattaching it to this newer appointment.
  return matchingHistories[0] || null;
}

function getPacienteSnapshot({ paciente, formData, patientName, existing }) {
  const patient = getPacienteInput(paciente);
  const previous = existing?.paciente || {};

  return {
    nombre: patientName,
    sexo: valueToText(patient.sexo || formData.sexo || previous.sexo).slice(0, 30),
    celular: valueToText(
      patient.celular || patient.telefono || formData.telefono || previous.celular,
    ).slice(0, 40),
    dni: valueToText(formData.dni || previous.dni).slice(0, 8),
  };
}

async function getDoctor(doctorId) {
  const id = ensureObjectId(doctorId, "El médico autenticado");
  const doctor = await userRepository.findById(id, DOCTOR_FIELDS);

  if (!doctor || doctor.rol !== "doctor") {
    throw new AppError("No tienes permiso para gestionar historias clínicas.", 403);
  }

  return doctor;
}

/**
 * The profile is the source of truth for the doctor's public identity. This
 * refreshes that identity in every one of the doctor's histories so a future
 * PDF generation always uses the latest name, CMP and signature. It never
 * changes patient data or clinical answers.
 */
async function sincronizarDatosMedicoEnHistorias(doctor) {
  if (valueToText(doctor?.rol).toLowerCase() !== "doctor") {
    return { matchedCount: 0, modifiedCount: 0 };
  }

  const doctorId = ensureObjectId(
    doctor?._id || doctor?.id,
    "El médico a sincronizar",
  );

  return historiaClinicaRepository.updateDoctorMetadata(doctorId, {
    nombre: valueToText(doctor.nombre),
    cmp: valueToText(doctor.cmp),
    firmaDigital: valueToText(doctor.firmaDigital),
    ...(doctor.firmaDigitalAsset ? { firmaDigitalAsset: doctor.firmaDigitalAsset } : {}),
  });
}

function validatePatientName(patientName) {
  const name = valueToText(patientName);
  if (!name) {
    throw new AppError("El nombre del paciente es obligatorio.", 400);
  }

  if (name.length > 160) {
    throw new AppError("El nombre del paciente supera el tamaño permitido.", 400);
  }

  return name;
}

function treatmentBelongsToDoctor(treatment, doctor) {
  if (valueToText(treatment?.rol).toLowerCase() !== "doctor") {
    return false;
  }

  return Boolean(treatment?.profesionalId) &&
    isSameId(treatment.profesionalId, doctor._id);
}

/**
 * Resuelve una identidad que sea demostrablemente atendida por el médico.
 * El id de tratamiento nunca se interpreta como id de cita: se recibe y se
 * verifica en un parámetro distinto para mantener la trazabilidad legada.
 */
async function resolveOwnedPatient({
  doctor,
  citaId,
  tratamientoId,
  patientName,
}) {
  const requestedName = patientName ? validatePatientName(patientName) : "";
  await professionalIdentityService.reconciliarIdentidadesProfesionales();

  if (citaId) {
    const id = ensureObjectId(citaId, "La cita");
    const cita = await citaRepository.findById(id);

    if (!cita) {
      throw new AppError("La cita seleccionada no existe.", 404);
    }

    if (!isSameId(cita.profesional, doctor._id)) {
      throw new AppError("No tienes permiso sobre la cita seleccionada.", 403);
    }

    // When the form was opened from an appointment, retain its linked
    // treatment too. This lets an old history anchored by `historiaId` keep
    // propagating the correction through the same immutable aggregate.
    const tratamiento = await tratamientoRepository.findByCita(cita._id);
    if (tratamiento?.profesionalId && !isSameId(tratamiento.profesionalId, doctor._id)) {
      throw new AppError("No tienes permiso sobre el tratamiento seleccionado.", 403);
    }

    return {
      cita,
      tratamiento,
      patientName: valueToText(cita.cliente),
      patientKey: normalizePatientKey(cita.cliente),
    };
  }

  if (tratamientoId) {
    const id = ensureObjectId(tratamientoId, "El tratamiento");
    const tratamiento = await tratamientoRepository.findById(id);

    if (!tratamiento) {
      throw new AppError("El tratamiento seleccionado no existe.", 404);
    }

    if (tratamiento.profesionalId && !isSameId(tratamiento.profesionalId, doctor._id)) {
      throw new AppError("No tienes permiso sobre el tratamiento seleccionado.", 403);
    }

    let cita = null;
    if (tratamiento.cita) {
      cita = await citaRepository.findById(tratamiento.cita);
      if (cita && isSameId(cita.profesional, doctor._id)) {
        return {
          cita,
          tratamiento,
          patientName: valueToText(cita.cliente),
          patientKey: normalizePatientKey(cita.cliente),
        };
      }
    }

    if (!treatmentBelongsToDoctor(tratamiento, doctor)) {
      throw new AppError("No tienes permiso sobre el tratamiento seleccionado.", 403);
    }

    const name = valueToText(tratamiento.nombre);
    return {
      cita: null,
      tratamiento,
      patientName: name,
      patientKey: normalizePatientKey(name),
    };
  }

  const name = validatePatientName(requestedName);
  const cita = await citaRepository.findByClienteAndProfesional(name, doctor._id);
  if (cita) {
    return {
      cita,
      tratamiento: null,
      patientName: valueToText(cita.cliente),
      patientKey: normalizePatientKey(cita.cliente),
    };
  }

  const tratamiento = await tratamientoRepository.findByNombreAndOwner(
    name,
    doctor._id,
    doctor.nombre,
    "doctor",
  );
  if (tratamiento) {
    return {
      cita: null,
      tratamiento,
      patientName: valueToText(tratamiento.nombre),
      patientKey: normalizePatientKey(tratamiento.nombre),
    };
  }

  throw new AppError(
    "No se encontró una cita o tratamiento del paciente asignado a este médico.",
    404,
  );
}

function ensureHistoryBelongsToDoctor(history, doctorId) {
  if (history && !isSameId(history.medico, doctorId)) {
    throw new AppError("No tienes permiso sobre esta historia clínica.", 403);
  }
  return history;
}

async function findExistingHistory({
  doctorId,
  historyId,
  citaId,
  tratamientoId,
  patientName,
}) {
  if (historyId) {
    const id = ensureObjectId(historyId, "La historia clínica");
    const byId = await historiaClinicaRepository.findByIdAndMedico(id, doctorId);
    if (!byId) {
      throw new AppError("La historia clínica a sincronizar no existe.", 404);
    }
    return byId;
  }

  if (citaId && OBJECT_ID_REGEX.test(getId(citaId))) {
    const byCita = await historiaClinicaRepository.findByCita(getId(citaId));
    if (byCita) return ensureHistoryBelongsToDoctor(byCita, doctorId);

    // Never use a display-name fallback when a cita id was supplied. It can
    // match a different patient with the same name.
    return null;
  }

  if (tratamientoId && OBJECT_ID_REGEX.test(getId(tratamientoId))) {
    const treatmentId = getId(tratamientoId);
    const byTreatment = await historiaClinicaRepository.findByTratamiento(
      treatmentId,
    );
    if (byTreatment) return ensureHistoryBelongsToDoctor(byTreatment, doctorId);

    const identityKey = buildClinicalHistoryIdentityKey({
      tratamientoId: treatmentId,
    });
    const byIdentity =
      await historiaClinicaRepository.findByMedicoAndClavePaciente(
        doctorId,
        identityKey,
      );
    if (byIdentity) return byIdentity;

    // A treatment id was supplied, so returning a history by its display name
    // would be unsafe for homonymous patients. Old unlinked histories remain
    // intact instead of being silently reassigned.
    return null;
  }

  const legacyKey = buildClinicalHistoryIdentityKey({ patientName });
  if (!legacyKey) return null;

  const currentLegacyHistory =
    await historiaClinicaRepository.findByMedicoAndClavePaciente(
      doctorId,
      legacyKey,
    );
  if (currentLegacyHistory) return currentLegacyHistory;

  // Compatibility with records written before legacy keys were prefixed.
  const oldLegacyKey = normalizePatientKey(patientName);
  return historiaClinicaRepository.findByMedicoAndClavePaciente(
    doctorId,
    oldLegacyKey,
  );
}

/**
 * A remote history id is a durable update anchor. It may attach a genuinely
 * old unlinked history to its selected source once only after verifying its
 * legacy identity, but it may never be used to swap a linked history.
 */
function ensureExistingHistoryMatchesIdentity(
  existing,
  identity,
  sourceInput = {},
) {
  if (!existing) return;

  const existingCitaId = getId(existing.cita);
  const existingTreatmentId = getId(existing.tratamiento);
  const sameCita = Boolean(
    existingCitaId &&
      identity.cita &&
      isSameId(existingCitaId, identity.cita._id),
  );
  const sameTreatment = Boolean(
    existingTreatmentId &&
      identity.tratamiento &&
      isSameId(existingTreatmentId, identity.tratamiento._id),
  );

  if (existingCitaId && !sameCita) {
    throw new AppError(
      "La historia clínica ya está vinculada a otra cita.",
      409,
    );
  }

  if (existingTreatmentId && !sameTreatment && !sameCita) {
    throw new AppError(
      "La historia clínica ya está vinculada a otro tratamiento.",
      409,
    );
  }

  ensureLegacyHistoryCanAttach({
    existing,
    identity,
    existingCitaId,
    existingTreatmentId,
    sourceInput,
  });
}

function ensureLegacyHistoryCanAttach({
  existing,
  identity,
  existingCitaId,
  existingTreatmentId,
  sourceInput,
}) {
  if (existingCitaId || existingTreatmentId) return;
  if (!identity.cita?._id && !identity.tratamiento?._id) return;

  const { historyId, citaId, tratamientoId, patientOriginalName } = sourceInput;
  if (!historyId || !hasImmutablePatientSource({ citaId, tratamientoId })) {
    throw new AppError(
      "Una historia clínica legacy solo puede vincularse con su cita o tratamiento original.",
      409,
    );
  }

  const originalName = normalizePatientKey(patientOriginalName);
  const sourceName = normalizePatientKey(identity.patientName);
  const snapshotNames = [
    existing?.paciente?.nombre,
    existing?.datosFormulario?.nombreCompleto,
  ]
    .map(normalizePatientKey)
    .filter(Boolean);
  const storedKey = valueToText(existing.clavePaciente);
  const hasModernKey = /^(cita|tratamiento):/i.test(storedKey);
  const legacyKey = normalizePatientKey(storedKey.replace(/^legacy:/i, ""));
  const namesToMatch = [
    ...snapshotNames,
    ...(legacyKey && !hasModernKey ? [legacyKey] : []),
  ];

  if (
    !originalName ||
    originalName !== sourceName ||
    hasModernKey ||
    namesToMatch.length === 0 ||
    namesToMatch.some((name) => name !== originalName)
  ) {
    throw new AppError(
      "La historia clínica legacy no coincide de forma segura con el paciente original.",
      409,
    );
  }
}

function didPatientNameChange(nombreActual, nombreNuevo) {
  return valueToText(nombreActual) !== valueToText(nombreNuevo);
}

function hasImmutablePatientSource({ citaId, tratamientoId }) {
  return (
    OBJECT_ID_REGEX.test(getId(citaId)) ||
    OBJECT_ID_REGEX.test(getId(tratamientoId))
  );
}

/** Prevent a second clinical document for the same immutable source. */
async function ensureHistoryKeyIsAvailable({ doctorId, existing, patientKey }) {
  const sameKeyHistory = await historiaClinicaRepository.findByMedicoAndClavePaciente(
    doctorId,
    patientKey,
  );

  if (sameKeyHistory && !isSameId(sameKeyHistory._id, existing?._id)) {
    throw new AppError(
      "Ya existe otra historia clínica del médico con ese nombre de paciente.",
      409,
    );
  }
}

function buildNotification(historia, doctor) {
  return {
    historiaId: historia._id,
    citaId: historia.cita || null,
    paciente: historia.paciente,
    proximoControl: historia.proximoControl,
    medico: {
      id: doctor._id,
      nombre: doctor.nombre,
    },
    finalizadaEn: historia.finalizadaEn,
  };
}

async function guardarHistoriaClinica({
  doctorId,
  historyId,
  citaId,
  tratamientoId,
  patientName,
  patientOriginalName,
  paciente,
  formData,
  currentStep,
  status,
}) {
  const payloadErrors = getPayloadValidationErrors(formData, currentStep);
  if (payloadErrors.length > 0) {
    const error = new AppError("Los datos de la historia clínica no son válidos.", 400);
    error.details = { errors: payloadErrors };
    throw error;
  }

  const doctor = await getDoctor(doctorId);
  // Estos datos provienen del usuario autenticado, no del navegador. De esta
  // forma la constancia no puede atribuirse a otro profesional al persistirla.
  const safeFormData = cloneFormData(formData);
  safeFormData.medicoTratante = doctor.nombre;
  safeFormData.nombreFirmaMedico = doctor.nombre;
  safeFormData.cmpConstancia = doctor.cmp || safeFormData.cmpConstancia || "";

  const requestedName = validatePatientName(
    patientName || getPacienteInput(paciente).nombre,
  );
  // A saved draft may carry the corrected display name while the selected
  // cita/tratamiento still stores the previous one. The original snapshot is
  // used only to locate legacy records; it is never persisted as the result.
  const lookupName = valueToText(patientOriginalName) || requestedName;

  // A display name is neither unique nor durable. Legacy read-only recovery
  // may still use it, but a correction needs the cita or treatment id so it
  // can never rename a homonymous patient by accident.
  if (
    didPatientNameChange(lookupName, requestedName) &&
    !hasImmutablePatientSource({ citaId, tratamientoId })
  ) {
    throw new AppError(
      "Para actualizar el nombre del paciente se requiere la cita o el tratamiento original.",
      400,
    );
  }

  let existing = await findExistingHistory({
    doctorId: doctor._id,
    historyId,
    citaId,
    tratamientoId,
    patientName: lookupName,
  });

  const identity = await resolveOwnedPatient({
    doctor,
    citaId,
    tratamientoId,
    patientName: lookupName,
  });

  ensureExistingHistoryMatchesIdentity(existing, identity, {
    historyId,
    citaId,
    tratamientoId,
    patientOriginalName: lookupName,
  });

  if (existing?.estado === "finalizada") {
    throw new AppError(
      "La historia clínica ya fue finalizada y no puede modificarse.",
      409,
    );
  }

  const patientKey = buildClinicalHistoryIdentityKey({
    citaId: identity.cita?._id,
    tratamientoId: identity.tratamiento?._id,
    patientName: requestedName,
  });
  await ensureHistoryKeyIsAvailable({
    doctorId: doctor._id,
    existing,
    patientKey,
  });

  const normalizedStatus = normalizeStatus(status);
  if (normalizedStatus === "finalizada") {
    const missingSections = getMissingFinalizationSections(safeFormData);
    if (missingSections.length > 0) {
      const error = new AppError(
        "No se puede finalizar: faltan secciones obligatorias por completar.",
        422,
      );
      error.details = { missingSections };
      throw error;
    }
  }

  const normalizedStep = currentStep === undefined ? existing?.pasoActual || 0 : currentStep;
  const proximoControl = safeFormData.proximoControl
    ? toUtcDate(safeFormData.proximoControl)
    : null;
  // The patient snapshot and form body must agree: the PDF reads the latter,
  // while the patient-history views read the former.
  safeFormData.nombreCompleto = requestedName;

  const patientRename = await patientIdentityService.synchronizePatientName({
    identity,
    existing,
    nombreNuevo: requestedName,
    formData: safeFormData,
  });

  const historyData = {
    pacienteId: patientRename.pacienteId,
    pacienteNombresAnteriores: patientRename.aliases,
    cita: identity.cita?._id || existing?.cita || undefined,
    tratamiento:
      identity.tratamiento?._id || existing?.tratamiento || undefined,
    medico: doctor._id,
    paciente: getPacienteSnapshot({
      paciente,
      formData: safeFormData,
      patientName: requestedName,
      existing,
    }),
    clavePaciente: patientKey,
    datosFormulario: safeFormData,
    pasoActual: normalizedStep,
    estado: normalizedStatus,
    proximoControl,
    firmaMedico: {
      nombre: doctor.nombre || "",
      cmp: doctor.cmp || "",
      url: doctor.firmaDigital || "",
      ...(doctor.firmaDigitalAsset ? { asset: doctor.firmaDigitalAsset } : {}),
    },
    finalizadaEn: normalizedStatus === "finalizada" ? new Date() : null,
    seguimientoAlimentarioHabilitado: normalizedStatus === "finalizada",
  };

  const wasCreated = !existing;
  const finalizadaAhora = normalizedStatus === "finalizada";
  let historia;

  try {
    if (existing) {
      Object.assign(existing, historyData);
      existing.markModified("datosFormulario");
      historia = await historiaClinicaRepository.save(existing);
    } else {
      try {
        historia = await historiaClinicaRepository.create(historyData);
      } catch (error) {
        if (error?.code !== 11000) throw error;

        const conflictingHistory = await findExistingHistory({
          doctorId: doctor._id,
          historyId,
          citaId: identity.cita?._id,
          tratamientoId: identity.tratamiento?._id,
          patientName: requestedName,
        });

        if (!conflictingHistory) throw error;
        if (conflictingHistory.estado === "finalizada") {
          throw new AppError("La historia clínica ya fue finalizada en otra sesión.", 409);
        }
        Object.assign(conflictingHistory, historyData);
        conflictingHistory.markModified("datosFormulario");
        historia = await historiaClinicaRepository.save(conflictingHistory);
      }
    }
  } catch (error) {
    await patientIdentityService.rollback(patientRename.operations);
    throw error;
  }

  return {
    historia,
    creada: wasCreated,
    finalizadaAhora,
    pacienteActualizado: patientRename,
    notificacion:
      finalizadaAhora ? buildNotification(historia, doctor) : null,
  };
}

async function obtenerHistoriaPorPaciente({
  doctorId,
  citaId,
  tratamientoId,
  patientName,
  paciente,
  patientPhone,
}) {
  const doctor = await getDoctor(doctorId);
  const requestedName = valueToText(patientName);
  // Authorize the current appointment/treatment first. The fallback below is
  // intentionally read-only and must never be usable to inspect another
  // doctor's finalized history.
  const identity = await resolveOwnedPatient({
    doctor,
    citaId,
    tratamientoId,
    patientName: requestedName,
  });
  const existing = await findExistingHistory({
    doctorId: doctor._id,
    citaId,
    tratamientoId,
    patientName: requestedName,
  });
  if (existing) return existing;

  return findCompletedHistoryForReturningPatient({
    doctorId: doctor._id,
    identity,
    paciente,
    patientPhone,
  });
}

async function obtenerHistoriaPorId({ doctorId, historyId }) {
  const id = ensureObjectId(historyId, "La historia clínica");
  const historia = await historiaClinicaRepository.findByIdAndMedico(id, doctorId);
  if (!historia) {
    throw new AppError("Historia clínica no encontrada.", 404);
  }
  return historia;
}

async function listarFinalizadasMedico(doctorId) {
  const doctor = await getDoctor(doctorId);
  return historiaClinicaRepository.findFinalizadasByMedico(doctor._id);
}

async function listarProximosControles() {
  return historiaClinicaRepository.findFinalizadasConProximoControl();
}

module.exports = {
  guardarHistoriaClinica,
  obtenerHistoriaPorPaciente,
  obtenerHistoriaPorId,
  listarFinalizadasMedico,
  listarProximosControles,
  sincronizarDatosMedicoEnHistorias,
};
