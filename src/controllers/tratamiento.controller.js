const tratamientoService = require("../services/tratamiento.service");
const asyncHandler = require("../helpers/asyncHandler");
const { deleteLocalFile } = require("../helpers/fileHelper");

/**
 * Controlador de Tratamientos.
 * Responsabilidad: orquestación HTTP y emisión de eventos Socket.IO.
 */

exports.crearTratamiento = asyncHandler(async (req, res) => {
  try {
    const nuevoTratamiento = await tratamientoService.crearTratamiento(
      req.body,
      req.files,
    );

    const io = req.app.get("io");
    io.emit("tratamientoActualizado", {
      message: "Nuevo tratamiento agregado",
      tratamiento: nuevoTratamiento,
    });

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
  const tratamientos = await tratamientoService.obtenerTratamientos();
  res.json(tratamientos);
});

exports.buscarPaciente = asyncHandler(async (req, res) => {
  const { nombre } = req.params;
  const paciente = await tratamientoService.buscarPaciente(nombre);
  res.json(paciente);
});
