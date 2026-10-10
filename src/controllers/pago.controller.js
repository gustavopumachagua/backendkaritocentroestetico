const pagoService = require("../services/pago.service");
const asyncHandler = require("../helpers/asyncHandler");
const { emitPagoEvent } = require("../helpers/realtimeEmitter");

/**
 * Controlador de Pagos.
 * Responsabilidad: orquestación HTTP y emisión de eventos Socket.IO.
 */

exports.registrarPago = asyncHandler(async (req, res) => {
  const { citaId, cliente, servicios, metodoPago, total, fecha } = req.body;

  const nuevoPago = await pagoService.registrarPago({
    citaId,
    cliente,
    servicios,
    metodoPago,
    total,
    fecha,
  }, req.user);

  emitPagoEvent(req.app.get("io"), "nuevoPago", nuevoPago);

  res.status(201).json({
    message: "Pago registrado y cita actualizada a cancelado",
    pago: nuevoPago,
  });
});

exports.obtenerPagos = asyncHandler(async (req, res) => {
  const pagos = await pagoService.obtenerPagos(req.user);
  res.json(pagos);
});

exports.obtenerPagosPorCita = asyncHandler(async (req, res) => {
  const { citaId } = req.params;
  const pagos = await pagoService.obtenerPagosPorCita(citaId, req.user);
  res.json(pagos);
});
