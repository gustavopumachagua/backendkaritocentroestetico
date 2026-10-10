const text = (value) => String(value ?? "").trim();
const getId = (value) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return text(value);
  if (typeof value.toHexString === "function") return value.toHexString();
  if (value._id && value._id !== value) return getId(value._id);
  if (typeof value.id === "string" || typeof value.id === "number") return text(value.id);
  return "";
};
const normalizeName = (value) => text(value).normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toLowerCase();
const normalizePhone = (value) => {
  let phone = text(value).replace(/\D/g, "");
  if (/^51\d{9}$/.test(phone)) phone = phone.slice(2);
  return /^\d{7,15}$/.test(phone) ? phone : "";
};
const normalizeDni = (value) => /^\d{8}$/.test(text(value)) ? text(value) : "";
const normalizeSex = (value) => {
  const sex = normalizeName(value);
  if (["f", "female", "femenino", "mujer"].includes(sex)) return "femenino";
  if (["m", "male", "masculino", "hombre"].includes(sex)) return "masculino";
  return sex;
};

function evidence(record, type) {
  return type === "historia" ? {
    name: record.paciente?.nombre || record.datosFormulario?.nombreCompleto,
    phone: normalizePhone(record.paciente?.celular || record.datosFormulario?.telefono),
    dni: normalizeDni(record.paciente?.dni || record.datosFormulario?.dni),
    sex: normalizeSex(record.paciente?.sexo),
  } : {
    name: record.nombre,
    phone: normalizePhone(record.celular),
    dni: normalizeDni(record.pacienteDni),
    sex: normalizeSex(record.sexo),
  };
}

function conflicts(first, second) {
  return ["phone", "dni", "sex"].some((key) => first[key] && second[key] && first[key] !== second[key]);
}

function sameVerifiedPatient(first, second) {
  return !conflicts(first, second) && Boolean(
    (first.dni && second.dni && first.dni === second.dni) ||
    (first.phone && second.phone && first.phone === second.phone),
  );
}

function uniqueRecords(records) {
  return [...new Map(records.filter(Boolean).map((record) => [getId(record), record])).values()];
}

function calendarDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // Date-only treatment inputs were historically persisted at UTC midnight;
  // appointment timestamps instead represent a real instant in Lima.
  if (date.toISOString().endsWith("T00:00:00.000Z")) return date.toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function legacyVisitKeys(record, type) {
  const day = calendarDay(record.fecha);
  const professionalId = getId(type === "cita" ? record.profesional : record.profesionalId);
  const services = (Array.isArray(record.servicio) ? record.servicio : [record.servicio])
    .map(normalizeName).filter(Boolean).sort();
  if (!day || !professionalId || !record.rol || !services.length) return [];
  const names = type === "cita" ? [record.cliente] :
    [record.nombre, ...(record.pacienteNombresAnteriores || [])];
  return [...new Set(names.map(normalizeName).filter(Boolean))].map((name) =>
    JSON.stringify([name, professionalId, normalizeName(record.rol), day, services]));
}

/**
 * Legacy names are only a candidate search. Persisted contact/DNI evidence
 * establishes a cross-visit identity; immutable references establish links.
 */
function selectPatientRecords({ identity, existing, records, pacienteId, names, submittedDni, approvedAppointmentIds = [] }) {
  const sourceTreatment = identity.tratamiento;
  const sourceHistory = existing;
  const sourceEvidence = evidence(sourceTreatment || {}, "tratamiento");
  const historyEvidence = evidence(sourceHistory || {}, "historia");
  const trusted = {
    phone: sourceEvidence.phone || historyEvidence.phone,
    dni: sourceEvidence.dni || historyEvidence.dni,
    sex: sourceEvidence.sex || historyEvidence.sex,
  };
  const expected = { ...trusted, dni: trusted.dni || normalizeDni(submittedDni) };
  const nameKeys = new Set(names.map(normalizeName).filter(Boolean));
  const reviewedAppointmentIds = new Set(approvedAppointmentIds);
  const sourceTreatmentId = getId(sourceTreatment);
  const sourceCitaId = getId(identity.cita);
  const sourceHistoryId = getId(sourceHistory);
  const belongsToDifferentPatient = (record) => record.pacienteId && getId(record.pacienteId) !== pacienteId;
  const hasPatientId = (record) => getId(record.pacienteId) === pacienteId;
  const hasKnownName = (record, type) => [
    evidence(record, type).name, ...(record.pacienteNombresAnteriores || []),
  ].some((name) => nameKeys.has(normalizeName(name)));
  const citasById = new Map((records.citas || []).map((record) => [getId(record), record]));
  const hasConflictingVisit = (record) => record.cita && belongsToDifferentPatient(citasById.get(getId(record.cita)) || {});
  const canAdopt = (record, type) => !belongsToDifferentPatient(record) && !hasConflictingVisit(record) && hasKnownName(record, type) &&
    !conflicts(expected, evidence(record, type)) && sameVerifiedPatient(trusted, evidence(record, type));

  const tratamientos = uniqueRecords([...(records.tratamientos || []), sourceTreatment]).filter((record) =>
    getId(record) === sourceTreatmentId || hasPatientId(record) || canAdopt(record, "tratamiento"),
  );
  const treatmentIds = new Set(tratamientos.map(getId));
  const linkedCitaIds = new Set([sourceCitaId, ...tratamientos.map((record) => getId(record.cita))].filter(Boolean));
  const historias = uniqueRecords([...(records.historias || []), sourceHistory]).filter((record) =>
    getId(record) === sourceHistoryId || hasPatientId(record) ||
    (!belongsToDifferentPatient(record) && !conflicts(expected, evidence(record, "historia")) &&
      ((record.tratamiento && treatmentIds.has(getId(record.tratamiento))) ||
       (record.cita && linkedCitaIds.has(getId(record.cita))) || canAdopt(record, "historia"))),
  );
  historias.forEach((record) => { if (record.cita) linkedCitaIds.add(getId(record.cita)); });

  // Legacy attended visits can lack their explicit treatment link. Recover
  // only a globally one-to-one current/previous-name, professional, role,
  // day and service counterpart. Persisted aliases survive partial renames.
  // Unknown future reservations never gain identity from display text alone.
  const treatmentCounts = new Map();
  for (const record of uniqueRecords(records.tratamientos || [])) {
    for (const key of legacyVisitKeys(record, "tratamiento")) {
      treatmentCounts.set(key, (treatmentCounts.get(key) || 0) + 1);
    }
  }
  const visitCounts = new Map();
  for (const record of uniqueRecords(records.citas || [])) {
    for (const key of legacyVisitKeys(record, "cita")) {
      visitCounts.set(key, (visitCounts.get(key) || 0) + 1);
    }
  }
  const verifiedLegacyKeys = new Set(tratamientos.filter((record) => {
    const data = evidence(record, "tratamiento");
    return Boolean(data.phone || data.dni) && !conflicts(expected, data) &&
      (hasPatientId(record) || sameVerifiedPatient(trusted, data));
  }).flatMap((record) => {
    const keys = legacyVisitKeys(record, "tratamiento");
    // One treatment cannot recover two visits stored under different aliases.
    // Every appointment status still counts when checking ambiguity.
    if (keys.reduce((count, key) => count + (visitCounts.get(key) || 0), 0) !== 1) return [];
    return keys.filter((key) => treatmentCounts.get(key) === 1 && visitCounts.get(key) === 1);
  }));
  const citas = uniqueRecords([...(records.citas || []), identity.cita]).filter((record) =>
    getId(record) === sourceCitaId || hasPatientId(record) ||
    (!belongsToDifferentPatient(record) && (linkedCitaIds.has(getId(record)) ||
      (reviewedAppointmentIds.has(getId(record)) && nameKeys.has(normalizeName(record.cliente))) ||
      (record.estado === "atendido" && legacyVisitKeys(record, "cita").some((key) => verifiedLegacyKeys.has(key))))),
  );
  const citaIds = new Set(citas.map(getId));
  const pagos = (records.pagos || []).filter((record) => hasPatientId(record) ||
    (!belongsToDifferentPatient(record) && citaIds.has(getId(record.cita))),
  );
  const selectedVisitIds = new Set(citas.map(getId));
  const excludedCitas = (records.citas || []).filter((record) =>
    nameKeys.has(normalizeName(record.cliente)) && !selectedVisitIds.has(getId(record)));
  return { tratamientos, historias, citas, pagos, excludedCitas };
}

module.exports = { text, getId, normalizeName, normalizePhone, normalizeDni, normalizeSex, evidence, conflicts, sameVerifiedPatient, selectPatientRecords };
