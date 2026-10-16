const tratamientoService = require("../services/tratamiento.service");
const patientDemographicsService = require("../services/patientDemographics.service");
const asyncHandler = require("../helpers/asyncHandler");
const { deleteLocalFile } = require("../helpers/fileHelper");
const { validateImageFiles } = require("../helpers/imageFileValidator");
const { emitTratamientoEvent } = require("../helpers/realtimeEmitter");

/**
 * Controlador de Tratamientos.
 * Responsabilidad: orquestación HTTP y emisión de eventos Socket.IO.
 */

exports.crearTratamiento = asyncHandler(async (req, res) => {
  try {
    await validateImageFiles(req.files || []);
    const nuevoTratamiento = await tratamientoService.crearTratamiento(
      req.body,
      req.files,
      req.user,
    );

    const payload = {
      message: "Nuevo tratamiento agregado",
      tratamiento: nuevoTratamiento,
    };
    emitTratamientoEvent(
      req.app.get("io"),
      "tratamientoActualizado",
      payload,
      nuevoTratamiento,
    );

    res.status(201).json({
      message: "✅ Tratamiento registrado y cita marcada como atendida.",
      tratamiento: nuevoTratamiento,
    });
  } catch (error) {
    // Limpiar archivos temporales en caso de error
    if (req.files?.length) {
      req.files.forEach((file) => deleteLocalFile(file.path));
    }

    // Re-lanzar para que asyncHandler/errorHandler lo maneje
    throw error;
  }
});

exports.obtenerTratamientos = asyncHandler(async (req, res) => {
  const tratamientos = await tratamientoService.obtenerTratamientos(req.user);
  res.json(tratamientos);
});

exports.obtenerHistorialAtenciones = asyncHandler(async (req, res) => {
  const atenciones = await tratamientoService.obtenerHistorialAtenciones(req.user);
  res.json(atenciones);
});

exports.obtenerTratamientosParaReporteServicios = asyncHandler(async (req, res) => {
  const tratamientos =
    await tratamientoService.obtenerTratamientosParaReporteServicios(req.user);
  res.json(tratamientos);
});

exports.buscarPaciente = asyncHandler(async (req, res) => {
  const { nombre } = req.params;
  const paciente = await tratamientoService.buscarPaciente(nombre, req.user);
  res.json(paciente);
});

exports.obtenerPacientePorCita = asyncHandler(async (req, res) => {
  const paciente = await patientDemographicsService.getByAppointment(req.params.citaId, req.user);
  res.json(paciente);
});
