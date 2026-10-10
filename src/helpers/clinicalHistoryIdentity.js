const { getId: getRecordId } = require("./patientIdentity");

function normalizePatientName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Clinical histories must not use a display name as their primary key: names
 * can be corrected and different people can share one. Prefer the immutable
 * appointment or treatment id; only old records without either use a legacy
 * name key.
 */
function buildClinicalHistoryIdentityKey({
  citaId,
  tratamientoId,
  patientName,
} = {}) {
  const cita = getRecordId(citaId);
  if (cita) return `cita:${cita}`;

  const tratamiento = getRecordId(tratamientoId);
  if (tratamiento) return `tratamiento:${tratamiento}`;

  const legacyName = normalizePatientName(patientName);
  return legacyName ? `legacy:${legacyName}` : "";
}

module.exports = {
  buildClinicalHistoryIdentityKey,
  getRecordId,
  normalizePatientName,
};
