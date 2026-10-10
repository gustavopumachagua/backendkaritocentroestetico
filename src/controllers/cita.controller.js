const citaService = require("../services/cita.service");
const asyncHandler = require("../helpers/asyncHandler");
const { emitCitaEvent } = require("../helpers/realtimeEmitter");

/**
 * Controlador de Citas.
 * Responsabilidad: orquestación HTTP y emisión de eventos Socket.IO.
 */

exports.obtenerCitas = asyncHandler(async (req, res) => {
  const citas = await citaService.obtenerCitas(req.user);
  res.json(citas);
});

exports.crearCita = asyncHandler(async (req, res) => {
  const { cliente, rol, profesional, servicio, fecha, idempotencyKey, citaPacienteId } = req.body;
  const resultado = await citaService.crearCita({
    cliente,
    rol,
    profesional,
    servicio,
    fecha,
    idempotencyKey,
    citaPacienteId,
  }, req.user);

  if (resultado.creada) {
    emitCitaEvent(req.app.get("io"), "nuevaCita", resultado.cita);
  }

  res.status(resultado.creada ? 201 : 200).json({
    message: resultado.creada ? "Cita creada" : "Cita ya registrada",
    cita: resultado.cita,
  });
});

exports.actualizarCita = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cliente, rol, profesional, servicio, fecha } = req.body;

  const citaActualizada = await citaService.actualizarCita(id, {
    cliente,
    rol,
    profesional,
    servicio,
    fecha,
  }, req.user);

  emitCitaEvent(req.app.get("io"), "citaActualizada", citaActualizada);

  res.json({ message: "Cita actualizada", cita: citaActualizada });
});

exports.eliminarCita = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const citaEliminada = await citaService.eliminarCita(id, req.user);

  emitCitaEvent(req.app.get("io"), "citaEliminada", citaEliminada, { _id: id });

  res.json({ message: "Cita eliminada", cita: citaEliminada });
});

exports.actualizarEstadoCita = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  const citaActualizada = await citaService.actualizarEstadoCita(
    id,
    estado,
    req.user,
  );

  emitCitaEvent(req.app.get("io"), "estadoCitaActualizado", citaActualizada);

  res.json({ message: "Estado actualizado", cita: citaActualizada });
});

exports.buscarPacientes = asyncHandler(async (req, res) => {
  const nombre = req.query.nombre;
  const resultado = await citaService.buscarPacientes(nombre, req.user);
  res.json(resultado);
});
