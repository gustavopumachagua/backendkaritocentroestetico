const { getId: getRecordId } = require("./patientIdentity");

function emitToRoom(io, room, event, payload) {
  if (io && room) io.to(room).emit(event, payload);
}

/**
 * An appointment is visible to administration and reception, while a doctor
 * receives only appointments assigned to that account. Cosmiatra appointments
 * are already delivered through the reception room, avoiding duplicate events.
 */
function emitCitaEvent(io, event, cita, payload = cita) {
  if (!io || !cita) return;

  emitToRoom(io, "role:administrador", event, payload);
  emitToRoom(io, "role:cosmiatra", event, payload);

  if (String(cita.rol || "").toLowerCase() === "doctor") {
    const professionalId = getRecordId(cita.profesional);
    if (professionalId) emitToRoom(io, `user:${professionalId}`, event, payload);
  }
}

/** New treatments belong to their immutable professional account. */
function emitTratamientoEvent(io, event, payload, tratamiento = payload?.tratamiento) {
  if (!io) return;

  emitToRoom(io, "role:administrador", event, payload);
  const professionalId = getRecordId(tratamiento?.profesionalId);
  if (professionalId) emitToRoom(io, `user:${professionalId}`, event, payload);
}

/** Payments are operated by administration and reception. */
function emitPagoEvent(io, event, payload) {
  emitToRoom(io, "role:administrador", event, payload);
  emitToRoom(io, "role:cosmiatra", event, payload);
}

/** Inventory updates are relevant to administrators and the affected specialty. */
function emitInventarioEvent(io, event, payload) {
  if (!io) return;

  emitToRoom(io, "role:administrador", event, payload);
  const role = String(payload?.rol || "").toLowerCase();
  if (role === "doctor" || role === "cosmiatra") {
    emitToRoom(io, `role:${role}`, event, payload);
  }
}

/** Follow-up notices are only actionable by reception and administration. */
function emitClinicalControlEvent(io, event, payload) {
  emitToRoom(io, "role:administrador", event, payload);
  emitToRoom(io, "role:cosmiatra", event, payload);
}

/** Current public professional identity is shared by authenticated role rooms. */
function emitProfessionalUpdatedEvent(io, user) {
  if (!io || !["doctor", "cosmiatra"].includes(user?.rol)) return;

  const payload = { id: String(getRecordId(user)), nombre: user.nombre, rol: user.rol };
  io.to("role:administrador")
    .to("role:doctor")
    .to("role:cosmiatra")
    .emit("profesionalActualizado", payload);
}

/** Names are operational metadata; clinical answers stay in their owner room. */
function emitPatientUpdatedEvent(io, patient, professionalIds = []) {
  if (!io || !patient?.pacienteId) return;
  let rooms = io.to("role:administrador").to("role:cosmiatra");
  for (const id of new Set(professionalIds.map(getRecordId).filter(Boolean))) rooms = rooms.to(`user:${id}`);
  rooms.emit("pacienteActualizado", {
    pacienteId: getRecordId(patient.pacienteId), nombre: patient.nombre, nombreAnterior: patient.nombreAnterior,
  });
}

/** Immediately revoke realtime access after suspension, deletion or reset. */
function disconnectUserSockets(io, userId) {
  if (!io?.in || !userId) return;

  // Socket.IO applies this to every local socket in the authenticated user
  // room. A multi-node deployment must use a compatible shared adapter.
  io.in(`user:${userId}`)?.disconnectSockets?.(true);
}

module.exports = {
  emitCitaEvent,
  emitTratamientoEvent,
  emitPagoEvent,
  emitInventarioEvent,
  emitClinicalControlEvent,
  emitProfessionalUpdatedEvent,
  emitPatientUpdatedEvent,
  disconnectUserSockets,
};
