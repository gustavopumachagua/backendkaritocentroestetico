const pagoRepository = require("../repositories/pago.repository");
const citaRepository = require("../repositories/cita.repository");
const tratamientoRepository = require("../repositories/tratamiento.repository");
const AppError = require("../errors/AppError");
const {
  NUMERO_BOLETA_INICIAL,
  SERIE_BOLETA,
  OBJECT_ID_REGEX,
  PAYMENT_ROLES,
} = require("../constants");

/**
 * Servicio de lógica de negocio para Pagos.
 */

function normalizeText(value) {
  return String(value || "").trim();
}

function assertCanRegisterPayment(actor) {
  if (!actor?.id || !PAYMENT_ROLES.includes(actor.rol)) {
    throw new AppError("No tienes permiso para registrar pagos.", 403);
  }
}

function getCitaServices(cita) {
  return Array.isArray(cita.servicio)
    ? cita.servicio.map(normalizeText).filter(Boolean)
    : [normalizeText(cita.servicio)].filter(Boolean);
}

function validateCitaId(citaId) {
  if (!OBJECT_ID_REGEX.test(String(citaId || ""))) {
    throw new AppError("La cita seleccionada no es válida.", 400);
  }
}

function sameServiceList(first, second) {
  if (first.length !== second.length) return false;
  const sortedFirst = [...first].sort();
  const sortedSecond = [...second].sort();
  return sortedFirst.every((name, index) => name === sortedSecond[index]);
}

const registrarPago = async (
  { citaId, cliente, servicios, metodoPago, total, fecha },
  actor,
) => {
  assertCanRegisterPayment(actor);
  validateCitaId(citaId);
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
    if (
      !s ||
      s.precio == null ||
      !Number.isFinite(Number(s.precio)) ||
      Number(s.precio) < 0
    ) {
      throw new AppError(
        "Cada servicio debe tener un precio numérico igual o mayor a 0.",
        400,
      );
    }
  }

  const sumaCalc = servicios.reduce((acc, s) => acc + Number(s.precio), 0);
  if (!Number.isFinite(Number(total)) || Number(total) !== Number(sumaCalc)) {
    throw new AppError(
      "El total no coincide con la suma de los precios de los servicios.",
      400,
    );
  }

  const cita = await citaRepository.findById(citaId);
  if (!cita) {
    throw new AppError("Cita no encontrada", 404);
  }

  if (normalizeText(cliente) !== normalizeText(cita.cliente)) {
    throw new AppError("El paciente no coincide con la cita seleccionada.", 400);
  }

  if (cita.estado !== "atendido") {
    throw new AppError("Solo se puede registrar el pago de una cita atendida.", 400);
  }

  const citaServices = new Set(getCitaServices(cita));
  const hasUnknownService = servicios.some(
    (service) => !citaServices.has(normalizeText(service.nombre)),
  );

  const paymentServiceNames = servicios.map((service) => normalizeText(service.nombre));
  if (hasUnknownService || !sameServiceList(getCitaServices(cita), paymentServiceNames)) {
    throw new AppError("Los servicios no coinciden con la cita seleccionada.", 400);
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
    cliente: cita.cliente,
    pacienteId: cita.pacienteId || (await tratamientoRepository.findByCita(citaId))?.pacienteId,
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

const obtenerPagos = async (actor) => {
  if (!actor?.id || !actor.rol) {
    throw new AppError("No autorizado", 403);
  }

  if (actor.rol !== "doctor") {
    return pagoRepository.findAll();
  }

  const citas = await citaRepository.findByProfesional(actor.id);
  return pagoRepository.findByCitas(citas.map((cita) => cita._id));
};

const obtenerPagosPorCita = async (citaId, actor) => {
  if (!actor?.id || !actor.rol) {
    throw new AppError("No autorizado", 403);
  }

  validateCitaId(citaId);
  if (actor.rol === "doctor") {
    const cita = await citaRepository.findById(citaId);
    if (!cita) throw new AppError("Cita no encontrada", 404);
    if (String(cita.profesional) !== String(actor.id)) {
      throw new AppError("No tienes permiso sobre esta cita.", 403);
    }
  }

  return pagoRepository.findByCita(citaId);
};

module.exports = {
  registrarPago,
  obtenerPagos,
  obtenerPagosPorCita,
};
