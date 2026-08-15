const citaRepository = require("../repositories/cita.repository");
const userRepository = require("../repositories/user.repository");
const servicioRepository = require("../repositories/servicio.repository");
const inventarioRepository = require("../repositories/inventario.repository");
const escapeRegex = require("../utils/escapeRegex");
const AppError = require("../errors/AppError");
const {
  ESTADOS_CITA_VALIDOS,
  ESTADO_CITA_PENDIENTE,
  OBJECT_ID_REGEX,
  PROFESIONAL_FIELDS_MINIMAL,
} = require("../constants");

/**
 * Servicio de lógica de negocio para Citas.
 */

// ─── Helpers privados ────────────────────────────────────────────────────────

/**
 * Resuelve el documento del profesional por ID o nombre+rol.
 * Función extraída para eliminar duplicación entre crearCita y actualizarCita.
 */
async function resolverProfesional(profesional, rol) {
  let profesionalDoc;

  if (OBJECT_ID_REGEX.test(profesional)) {
    profesionalDoc = await userRepository.findById(profesional);
  } else {
    profesionalDoc = await userRepository.findByNombreAndRol(profesional, rol);
  }

  if (!profesionalDoc) {
    throw new AppError(
      "Profesional no encontrado para el rol indicado.",
      404,
    );
  }

  if (profesionalDoc.rol !== rol) {
    throw new AppError(
      "El profesional no corresponde al rol seleccionado.",
      400,
    );
  }

  return profesionalDoc;
}

/**
 * Valida que los servicios proporcionados existan para el rol indicado.
 */
async function validarServiciosPorRol(rol, serviciosArray) {
  const encontrados = await servicioRepository.findByRolAndNombres(
    rol,
    serviciosArray,
  );

  if (encontrados.length > 0) {
    return encontrados.map((s) => s.nombre);
  }

  // Fallback: buscar en inventario tipo "servicio"
  const enInventario = await inventarioRepository.findByRol(rol);
  const inventarioServicios = enInventario
    .filter((i) => i.tipo === "servicio" && serviciosArray.includes(i.nombre))
    .map((i) => i.nombre);

  return inventarioServicios.length > 0 ? inventarioServicios : serviciosArray;
}

function validarFecha(fecha) {
  const fechaObj = new Date(fecha);
  if (isNaN(fechaObj.getTime())) {
    throw new AppError("Fecha inválida", 400);
  }
  return fechaObj;
}

// ─── Operaciones públicas ────────────────────────────────────────────────────

const obtenerCitas = async () => {
  return citaRepository.findAll();
};

const crearCita = async ({ cliente, rol, profesional, servicio, fecha }) => {
  if (!cliente || !rol || !profesional || !fecha) {
    throw new AppError(
      "Datos incompletos. cliente, rol, profesional y fecha son requeridos.",
      400,
    );
  }

  const rolNormalizado = rol.toLowerCase();
  const profesionalDoc = await resolverProfesional(profesional, rolNormalizado);

  let serviciosValidos = [];
  if (Array.isArray(servicio) && servicio.length > 0) {
    serviciosValidos = await validarServiciosPorRol(rolNormalizado, servicio);
  }

  const fechaObj = validarFecha(fecha);

  const nuevaCita = await citaRepository.create({
    cliente,
    rol: rolNormalizado,
    profesional: profesionalDoc._id,
    servicio: serviciosValidos.length > 0 ? serviciosValidos : servicio,
    fecha: fechaObj,
  });

  const citaPop = await citaRepository.findByIdPopulated(nuevaCita._id);
  return citaPop;
};

const actualizarCita = async (id, { cliente, rol, profesional, servicio, fecha }) => {
  if (!cliente || !rol || !profesional || !fecha) {
    throw new AppError(
      "Datos incompletos. cliente, rol, profesional y fecha son requeridos.",
      400,
    );
  }

  const cita = await citaRepository.findById(id);
  if (!cita) {
    throw new AppError("Cita no encontrada", 404);
  }

  const rolNormalizado = rol.toLowerCase();
  const profesionalDoc = await resolverProfesional(profesional, rolNormalizado);

  let serviciosValidos = [];
  if (Array.isArray(servicio) && servicio.length > 0) {
    serviciosValidos = await validarServiciosPorRol(rolNormalizado, servicio);
  }

  const fechaObj = validarFecha(fecha);

  cita.cliente = cliente;
  cita.rol = rolNormalizado;
  cita.profesional = profesionalDoc._id;
  cita.servicio = serviciosValidos.length > 0 ? serviciosValidos : servicio;
  cita.fecha = fechaObj;

  await citaRepository.save(cita);

  const citaActualizada = await citaRepository.findByIdPopulated(id);
  return citaActualizada;
};

const eliminarCita = async (id) => {
  const citaEliminada = await citaRepository.deleteById(id);
  if (!citaEliminada) {
    throw new AppError("Cita no encontrada", 404);
  }
  return citaEliminada;
};

const actualizarEstadoCita = async (id, estado) => {
  if (!ESTADOS_CITA_VALIDOS.includes(estado)) {
    throw new AppError("Estado inválido", 400);
  }

  const cita = await citaRepository.findById(id);
  if (!cita) {
    throw new AppError("Cita no encontrada", 404);
  }

  if (cita.estado !== ESTADO_CITA_PENDIENTE) {
    throw new AppError("El estado solo puede cambiar una vez", 400);
  }

  cita.estado = estado;
  await citaRepository.save(cita);

  const citaActualizada = await citaRepository.findByIdPopulated(
    id,
    PROFESIONAL_FIELDS_MINIMAL,
  );
  return citaActualizada;
};

const buscarPacientes = async (nombre) => {
  const nombreLimpio = String(nombre || "").trim().slice(0, 80);
  if (!nombreLimpio) return [];

  const citas = await citaRepository.searchByClientName(
    escapeRegex(nombreLimpio),
  );

  const nombresUnicos = [...new Set(citas.map((c) => c.cliente))].map(
    (n) => ({ nombre: n }),
  );

  return nombresUnicos;
};

module.exports = {
  obtenerCitas,
  crearCita,
  actualizarCita,
  eliminarCita,
  actualizarEstadoCita,
  buscarPacientes,
};
