const { getId, normalizeName } = require("./patientIdentity");

const limaDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
});

function plain(record) {
  return record && typeof record.toObject === "function" ? record.toObject() : record;
}

function calendarDay(value, dateOnlyTreatment = false) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (dateOnlyTreatment && date.toISOString().endsWith("T00:00:00.000Z")) {
    return date.toISOString().slice(0, 10);
  }
  const parts = limaDayFormatter.formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function appointmentView(record) {
  const professional = plain(record.profesional);
  return {
    _id: getId(record),
    fecha: record.fecha,
    profesional: professional && typeof professional === "object" ? {
      _id: getId(professional),
      nombre: String(professional.nombre || "").trim(),
      rol: professional.rol,
    } : professional,
    ...(getId(record.pacienteId) ? { pacienteId: getId(record.pacienteId) } : {}),
    cliente: record.cliente,
    servicio: Array.isArray(record.servicio) ? [...record.servicio] : [],
    rol: record.rol,
    estado: record.estado,
  };
}

function visitKeys(record, appointment = false) {
  const patientId = getId(record.pacienteId);
  const professionalId = getId(appointment ? record.profesional : record.profesionalId);
  const role = normalizeName(record.rol);
  const day = calendarDay(record.fecha, !appointment);
  // Sorting retains duplicates: two identical services are not one service.
  const services = (Array.isArray(record.servicio) ? record.servicio : [])
    .map(normalizeName).filter(Boolean).sort();
  if (!professionalId || !role || !day || !services.length) return [];
  const identities = patientId ? [`paciente:${patientId}`] : [...new Set(
    (appointment ? [record.cliente] : [record.nombre, ...(record.pacienteNombresAnteriores || [])])
      .map(normalizeName).filter(Boolean),
  )].map((name) => `nombre:${name}`);
  return identities.map((identity) => JSON.stringify([identity, professionalId, role, day, services]));
}

/**
 * Presents attended appointments without inventing a persisted treatment.
 * Inputs must already be authorized by the caller. Immutable cita references
 * win; legacy matches require a unique counterpart on both sides. Patient
 * names are considered only when neither record has a persisted patient id.
 */
function buildAttentionHistory({ tratamientos = [], citas = [] } = {}) {
  const treatments = tratamientos.map(plain).filter(Boolean);
  const appointments = [...new Map(citas.map(plain)
    .filter((record) => record && record.estado === "atendido" && getId(record))
    .map((record) => [getId(record), record])).values()];
  const linkedAppointments = new Set(treatments.map((record) => getId(record.cita)).filter(Boolean));
  const appointmentsById = new Map(appointments.map((record) => [getId(record), record]));
  const candidates = appointments.filter((record) => !linkedAppointments.has(getId(record)));
  const treatmentsByKey = new Map();
  treatments.forEach((record, index) => {
    if (getId(record.cita)) return;
    for (const key of visitKeys(record)) {
      const indexes = treatmentsByKey.get(key) || new Set();
      indexes.add(index);
      treatmentsByKey.set(key, indexes);
    }
  });
  const candidateTreatments = new Map();
  const candidateAppointments = new Map();
  candidates.forEach((record) => {
    const appointmentId = getId(record);
    const matches = new Set(visitKeys(record, true)
      .flatMap((key) => [...(treatmentsByKey.get(key) || [])]));
    candidateTreatments.set(appointmentId, matches);
    for (const index of matches) {
      const ids = candidateAppointments.get(index) || new Set();
      ids.add(appointmentId);
      candidateAppointments.set(index, ids);
    }
  });
  const legacyMatches = new Map();
  for (const record of candidates) {
    const appointmentId = getId(record);
    const matches = candidateTreatments.get(appointmentId);
    if (matches.size !== 1) continue;
    const index = [...matches][0];
    if (candidateAppointments.get(index)?.size !== 1) continue;
    legacyMatches.set(index, record);
    linkedAppointments.add(appointmentId);
  }

  // Demographics may come only from the already authorized treatment input
  // carrying the same immutable patient id. A display-name match never does.
  const patientDetails = new Map();
  for (const treatment of treatments) {
    const patientId = getId(treatment.pacienteId);
    if (!patientId) continue;
    const details = patientDetails.get(patientId) || {};
    for (const field of ["sexo", "celular"]) {
      if (!details[field] && treatment[field]) details[field] = treatment[field];
    }
    patientDetails.set(patientId, details);
  }
  const result = treatments.map((record, index) => {
    const appointment = appointmentsById.get(getId(record.cita)) || legacyMatches.get(index);
    if (!appointment) return record;
    // Enrich only the same immutable reference; retain the real treatment's
    // date and every clinical field. Appointment time remains on cita.fecha.
    const originalCita = plain(record.cita);
    return { ...record, cita: {
      ...(originalCita && typeof originalCita === "object" &&
        typeof originalCita.toHexString !== "function" ? originalCita : {}),
      ...appointmentView(appointment),
    } };
  });
  for (const appointment of appointments) {
    const appointmentId = getId(appointment);
    if (linkedAppointments.has(appointmentId)) continue;
    const cita = appointmentView(appointment);
    const patientId = getId(appointment.pacienteId);
    result.push({
      _id: `cita:${appointmentId}`,
      cita,
      citaId: appointmentId,
      nombre: appointment.cliente,
      fecha: appointment.fecha,
      servicio: [...cita.servicio],
      rol: appointment.rol,
      profesional: String(cita.profesional?.nombre || "").trim(),
      profesionalId: getId(appointment.profesional),
      ...(patientId ? { pacienteId: patientId, ...(patientDetails.get(patientId) || {}) } : {}),
      registroTratamientoPendiente: true,
      origenRegistro: "cita",
    });
  }
  return result.sort((first, second) => {
    const timestamp = (record) => new Date(record.fecha).getTime() || 0;
    return timestamp(second) - timestamp(first);
  });
}

module.exports = { buildAttentionHistory };
