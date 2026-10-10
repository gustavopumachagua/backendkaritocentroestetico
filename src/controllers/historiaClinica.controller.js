const historiaClinicaService = require("../services/historiaClinica.service");
const asyncHandler = require("../helpers/asyncHandler");
const {
  emitClinicalControlEvent,
  emitPatientUpdatedEvent,
} = require("../helpers/realtimeEmitter");

function bodyToInput(req) {
  const body = req.body || {};
  const query = req.query || {};

  return {
    historyId: body.historiaId || body.historyId || body.remoteId || query.historiaId || query.historyId,
    citaId: req.params.citaId || body.citaId || query.citaId,
    tratamientoId: body.tratamientoId || query.tratamientoId,
    patientName:
      body.pacienteNombre ||
      body.patientName ||
      body.paciente?.nombre ||
      query.pacienteNombre ||
      query.patientName,
    patientOriginalName:
      body.pacienteNombreOriginal ||
      body.patientOriginalName ||
      body.paciente?.nombreOriginal ||
      query.pacienteNombreOriginal ||
      query.patientOriginalName,
    patientPhone:
      body.pacienteCelular ||
      body.patientPhone ||
      body.paciente?.celular ||
      body.paciente?.telefono ||
      query.pacienteCelular ||
      query.patientPhone,
    paciente: body.paciente,
    formData: body.formData ?? body.datosFormulario,
    currentStep: body.currentStep ?? body.pasoActual,
    status: body.status ?? body.estado,
  };
}

function serializeHistory(historia) {
  if (!historia) return null;

  const record = historia.toObject ? historia.toObject() : historia;
  return {
    ...record,
    citaId: record.cita || null,
    tratamientoId: record.tratamiento || null,
    formData: record.datosFormulario,
    currentStep: record.pasoActual,
    status: record.estado === "finalizada" ? "finalized" : "draft",
    completedAt: record.finalizadaEn,
    signatureUrl: record.firmaMedico?.url || "",
  };
}

const guardarHistoriaClinica = asyncHandler(async (req, res) => {
  const result = await historiaClinicaService.guardarHistoriaClinica({
    doctorId: req.user.id,
    ...bodyToInput(req),
  });

  if (result.finalizadaAhora) {
    emitClinicalControlEvent(
      req.app.get("io"),
      "historiaClinicaFinalizada",
      result.notificacion,
    );
  }

  if (result.pacienteActualizado?.changed) {
    emitPatientUpdatedEvent(
      req.app.get("io"),
      result.pacienteActualizado,
      result.pacienteActualizado.professionalIds,
    );
  }

  res.status(result.creada ? 201 : 200).json({
    message: result.finalizadaAhora
      ? "Historia clínica finalizada correctamente."
      : "Borrador de historia clínica guardado correctamente.",
    historia: serializeHistory(result.historia),
    pacienteActualizado: result.pacienteActualizado?.changed ? {
      pacienteId: result.pacienteActualizado.pacienteId,
      nombre: result.pacienteActualizado.nombre,
      nombreAnterior: result.pacienteActualizado.nombreAnterior,
      citasSinIdentidadVerificada: result.pacienteActualizado.excludedAppointmentsCount,
    } : null,
    notificacion: result.notificacion,
  });
});

const obtenerHistoriaPorPaciente = asyncHandler(async (req, res) => {
  const historia = await historiaClinicaService.obtenerHistoriaPorPaciente({
    doctorId: req.user.id,
    ...bodyToInput(req),
  });

  res.json({ historia: serializeHistory(historia) });
});

const obtenerHistoriaPorId = asyncHandler(async (req, res) => {
  const historia = await historiaClinicaService.obtenerHistoriaPorId({
    doctorId: req.user.id,
    historyId: req.params.id,
  });

  res.json({ historia: serializeHistory(historia) });
});

const listarFinalizadasMedico = asyncHandler(async (req, res) => {
  const historias = await historiaClinicaService.listarFinalizadasMedico(req.user.id);
  res.json(historias.map(serializeHistory));
});

const listarProximosControles = asyncHandler(async (req, res) => {
  const controles = await historiaClinicaService.listarProximosControles();
  res.json(controles);
});

module.exports = {
  guardarHistoriaClinica,
  obtenerHistoriaPorPaciente,
  obtenerHistoriaPorId,
  listarFinalizadasMedico,
  listarProximosControles,
};
