const citaService = require("../services/cita.service");
const asyncHandler = require("../helpers/asyncHandler");

/**
 * Controlador de Citas.
 * Responsabilidad: orquestación HTTP y emisión de eventos Socket.IO.
 */

exports.obtenerCitas = asyncHandler(async (req, res) => {
  const citas = await citaService.obtenerCitas();
  res.json(citas);
});

exports.crearCita = asyncHandler(async (req, res) => {
  const { cliente, rol, profesional, servicio, fecha } = req.body;
  const citaPop = await citaService.crearCita({
    cliente,
    rol,
    profesional,
    servicio,
    fecha,
  });

  const io = req.app.get("io");
  io.emit("nuevaCita", citaPop);

  res.status(201).json({ message: "Cita creada", cita: citaPop });
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
  });

  const io = req.app.get("io");
  io.emit("citaActualizada", citaActualizada);

  res.json({ message: "Cita actualizada", cita: citaActualizada });
});

exports.eliminarCita = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const citaEliminada = await citaService.eliminarCita(id);

  const io = req.app.get("io");
  io.emit("citaEliminada", { _id: id });

  res.json({ message: "Cita eliminada", cita: citaEliminada });
});

exports.actualizarEstadoCita = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  const citaActualizada = await citaService.actualizarEstadoCita(id, estado);

  const io = req.app.get("io");
  io.emit("estadoCitaActualizado", citaActualizada);

  res.json({ message: "Estado actualizado", cita: citaActualizada });
});

exports.buscarPacientes = asyncHandler(async (req, res) => {
  const nombre = req.query.nombre;
  const resultado = await citaService.buscarPacientes(nombre);
  res.json(resultado);
});
