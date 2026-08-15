const pagoRepository = require("../repositories/pago.repository");
const citaRepository = require("../repositories/cita.repository");
const AppError = require("../errors/AppError");
const { NUMERO_BOLETA_INICIAL, SERIE_BOLETA } = require("../constants");

/**
 * Servicio de lógica de negocio para Pagos.
 */

const registrarPago = async ({
  citaId,
  cliente,
  servicios,
  metodoPago,
  total,
  fecha,
}) => {
  if (
    !citaId ||
    !cliente ||
    !servicios ||
    !metodoPago ||
    total == null ||
    !fecha
  ) {
    throw new AppError("Datos incompletos.", 400);
  }

  if (!Array.isArray(servicios) || servicios.length === 0) {
    throw new AppError("La lista de servicios está vacía.", 400);
  }

  for (const s of servicios) {
    if (s.precio == null || isNaN(s.precio) || Number(s.precio) < 0) {
      throw new AppError(
        "Cada servicio debe tener un precio numérico igual o mayor a 0.",
        400,
      );
    }
  }

  const sumaCalc = servicios.reduce((acc, s) => acc + Number(s.precio), 0);
  if (Number(total) !== Number(sumaCalc)) {
    throw new AppError(
      "El total no coincide con la suma de los precios de los servicios.",
      400,
    );
  }

  const cita = await citaRepository.findById(citaId);
  if (!cita) {
    throw new AppError("Cita no encontrada", 404);
  }

  const pagoExistente = await pagoRepository.findOneByCita(citaId);
  if (pagoExistente) {
    throw new AppError(
      "Ya existe un pago registrado para esta cita.",
      400,
    );
  }

  if (cita.estado === "cancelado") {
    throw new AppError(
      "Esta cita ya fue cancelada y no puede modificarse.",
      400,
    );
  }

  const ultimoPago = await pagoRepository.findLastByBoleta();
  let nuevoNumero = NUMERO_BOLETA_INICIAL;
  if (ultimoPago && ultimoPago.numeroBoleta) {
    nuevoNumero = ultimoPago.numeroBoleta + 1;
  }

  const nuevoPago = await pagoRepository.create({
    cita: citaId,
    cliente,
    servicios,
    metodoPago,
    total,
    fecha,
    estadoPago: "pagado",
    numeroBoleta: nuevoNumero,
    serie: SERIE_BOLETA,
  });

  return nuevoPago;
};

const obtenerPagos = async () => {
  return pagoRepository.findAll();
};

const obtenerPagosPorCita = async (citaId) => {
  return pagoRepository.findByCita(citaId);
};

module.exports = {
  registrarPago,
  obtenerPagos,
  obtenerPagosPorCita,
};
