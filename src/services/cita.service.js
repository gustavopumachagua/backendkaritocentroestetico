const citaRepository = require("../repositories/cita.repository");
const userRepository = require("../repositories/user.repository");
const servicioRepository = require("../repositories/servicio.repository");
const inventarioRepository = require("../repositories/inventario.repository");
const patientIdentityService = require("./patientIdentity.service");
const { normalizeName, getId: getRecordId } = require("../helpers/patientIdentity");
const escapeRegex = require("../utils/escapeRegex");
const AppError = require("../errors/AppError");
const {
  ESTADOS_CITA_VALIDOS,
  ESTADO_CITA_PENDIENTE,
  OBJECT_ID_REGEX,
  PROFESIONAL_FIELDS_MINIMAL,
  STAFF_ROLES,
  PROFESSIONAL_ROLES,
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

function normalizarNombreServicio(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160) {
    throw new AppError("El servicio seleccionado no es válido.", 400);
  }

  return value.trim();
}

function crearClaveServicio(value) {
  return normalizarNombreServicio(value).toLocaleLowerCase("es-PE");
}

/**
 * Valida que todos los servicios pertenezcan al catálogo del rol indicado.
 * Las citas antiguas pueden conservar, al editarse sin cambiar de rol, un
 * servicio histórico que ya no esté publicado en el catálogo actual.
 */
async function validarServiciosPorRol(
  rol,
  serviciosArray,
  { serviciosHistoricos = [] } = {},
) {
  if (!Array.isArray(serviciosArray)) {
    throw new AppError("La lista de servicios no es válida.", 400);
  }

  const serviciosPorClave = new Map();
  serviciosArray.forEach((servicio) => {
    const nombre = normalizarNombreServicio(servicio);
    const clave = crearClaveServicio(nombre);

    if (!serviciosPorClave.has(clave)) {
      serviciosPorClave.set(clave, nombre);
    }
  });

  const serviciosSolicitados = [...serviciosPorClave.values()];
  if (serviciosSolicitados.length === 0) return [];

  const [serviciosLegado, serviciosInventario] = await Promise.all([
    servicioRepository.findByRolAndNombres(rol, serviciosSolicitados),
    inventarioRepository.findByRolAndTipo(rol, "servicio"),
  ]);

  const serviciosPermitidos = new Set(
    [...serviciosLegado, ...serviciosInventario].map((servicio) =>
      crearClaveServicio(servicio.nombre),
    ),
  );

  // This exception is deliberately limited to services already present in the
  // same appointment. It keeps historical appointments editable while still
  // rejecting newly injected services from another specialty.
  if (Array.isArray(serviciosHistoricos)) {
    serviciosHistoricos.forEach((servicio) => {
      serviciosPermitidos.add(crearClaveServicio(servicio));
    });
  }

  const serviciosInvalidos = serviciosSolicitados.filter(
    (servicio) => !serviciosPermitidos.has(crearClaveServicio(servicio)),
  );

  if (serviciosInvalidos.length > 0) {
    throw new AppError(
      "Uno o más servicios no corresponden al rol seleccionado.",
      400,
    );
  }

  return serviciosSolicitados;
}

function validarFecha(fecha) {
  const fechaObj = new Date(fecha);
  if (isNaN(fechaObj.getTime())) {
    throw new AppError("Fecha inválida", 400);
  }
  return fechaObj;
}

function isSameId(first, second) {
  return String(getRecordId(first)) === String(getRecordId(second));
}

function assertAuthenticatedStaff(actor) {
  if (!actor?.id || !STAFF_ROLES.includes(actor.rol)) {
    throw new AppError("No autorizado", 403);
  }
}

function assertCanManageCita(actor, cita) {
  assertAuthenticatedStaff(actor);

  if (actor.rol === "doctor" && !isSameId(cita.profesional, actor.id)) {
    throw new AppError("No tienes permiso sobre esta cita", 403);
  }
}

function normalizeProfessionalRole(rol) {
  const normalized = String(rol || "").trim().toLowerCase();
  if (!PROFESSIONAL_ROLES.includes(normalized)) {
    throw new AppError("El rol profesional no es válido", 400);
  }
  return normalized;
}

function validateCitaId(id) {
  if (!OBJECT_ID_REGEX.test(String(id || ""))) {
    throw new AppError("La cita seleccionada no es válida.", 400);
  }
}

async function resolverCitaPaciente(citaPacienteId, cliente, actor) {
  if (citaPacienteId === undefined) return undefined;
  if (typeof citaPacienteId !== "string") {
    throw new AppError("La cita del cliente seleccionado no es válida.", 400);
  }
  validateCitaId(citaPacienteId);

  const cita = await citaRepository.findById(citaPacienteId);
  if (!cita) {
    throw new AppError("La cita del cliente seleccionado no fue encontrada.", 404);
  }
  assertCanManageCita(actor, cita);

  if (!OBJECT_ID_REGEX.test(getRecordId(cita.pacienteId))) {
    throw new AppError(
      "El cliente seleccionado aún no tiene una identidad verificada. Vuelve a buscarlo antes de registrar la cita.",
      409,
    );
  }
  if (normalizeName(cliente) !== normalizeName(cita.cliente)) {
    throw new AppError(
      "El nombre del cliente seleccionado cambió. Vuelve a buscarlo antes de registrar la cita.",
      409,
    );
  }

  return cita;
}

// ─── Operaciones públicas ────────────────────────────────────────────────────

const obtenerCitas = async (actor) => {
  assertAuthenticatedStaff(actor);
  return actor.rol === "doctor"
    ? citaRepository.findByProfesional(actor.id)
    : citaRepository.findAll();
};

const crearCita = async ({
  cliente,
  rol,
  profesional,
  servicio,
  fecha,
  idempotencyKey,
  citaPacienteId,
}, actor) => {
  assertAuthenticatedStaff(actor);
  if (!cliente || !rol || !profesional || !fecha) {
    throw new AppError(
      "Datos incompletos. cliente, rol, profesional y fecha son requeridos.",
      400,
    );
  }

  const rolNormalizado = normalizeProfessionalRole(rol);
  const claveIdempotencia = String(idempotencyKey || "").trim();

  if (claveIdempotencia.length > 100) {
    throw new AppError("La clave de idempotencia no es válida.", 400);
  }

  if (claveIdempotencia) {
    const citaExistente = await citaRepository.findByIdempotencyKey(
      claveIdempotencia,
    );

    if (citaExistente) {
      const citaExistentePopulada = await citaRepository.findByIdPopulated(
        citaExistente._id,
      );
      assertCanManageCita(actor, citaExistentePopulada);
      return {
        cita: citaExistentePopulada,
        creada: false,
      };
    }
  }

  const citaPaciente = await resolverCitaPaciente(citaPacienteId, cliente, actor);
  const profesionalDoc = await resolverProfesional(profesional, rolNormalizado);

  if (actor.rol === "doctor" && !isSameId(profesionalDoc._id, actor.id)) {
    throw new AppError("Un médico solo puede registrar citas propias", 403);
  }

  const serviciosValidos = await validarServiciosPorRol(
    rolNormalizado,
    servicio || [],
  );

  const fechaObj = validarFecha(fecha);

  let nuevaCita;
  const patientIdentity = await patientIdentityService.resolvePatientForRegistration({
    nombre: cliente,
    cita: citaPaciente,
  });

  try {
    nuevaCita = await citaRepository.create({
      cliente: patientIdentity.nombre,
      pacienteId: patientIdentity.pacienteId,
      rol: rolNormalizado,
      profesional: profesionalDoc._id,
      servicio: serviciosValidos,
      fecha: fechaObj,
      idempotencyKey: claveIdempotencia || undefined,
    });
  } catch (error) {
    if (claveIdempotencia && error?.code === 11000) {
      const citaExistente = await citaRepository.findByIdempotencyKey(
        claveIdempotencia,
      );

      if (citaExistente) {
        const citaExistentePopulada = await citaRepository.findByIdPopulated(
          citaExistente._id,
        );
        assertCanManageCita(actor, citaExistentePopulada);
        return {
          cita: citaExistentePopulada,
          creada: false,
        };
      }
    }

    throw error;
  }

  const citaPop = await citaRepository.findByIdPopulated(nuevaCita._id);
  return { cita: citaPop, creada: true };
};

const actualizarCita = async (
  id,
  { cliente, rol, profesional, servicio, fecha },
  actor,
) => {
  assertAuthenticatedStaff(actor);
  validateCitaId(id);
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

  assertCanManageCita(actor, cita);

  const rolNormalizado = normalizeProfessionalRole(rol);
  const profesionalDoc = await resolverProfesional(profesional, rolNormalizado);

  if (actor.rol === "doctor" && !isSameId(profesionalDoc._id, actor.id)) {
    throw new AppError("Un médico solo puede reasignar citas propias", 403);
  }

  const mantieneRol = cita.rol === rolNormalizado;
  const serviciosValidos = await validarServiciosPorRol(
    rolNormalizado,
    servicio || [],
    {
      serviciosHistoricos: mantieneRol ? cita.servicio : [],
    },
  );

  const fechaObj = validarFecha(fecha);

  if (cita.pacienteId && normalizeName(cliente) !== normalizeName(cita.cliente)) {
    throw new AppError(
      "Este cliente ya tiene registros vinculados. Corrige su nombre desde la historia clínica para actualizarlo en todos sus registros.",
      409,
    );
  }
  const patientIdentity = await patientIdentityService.resolvePatientForRegistration({
    nombre: cliente,
    existing: normalizeName(cliente) === normalizeName(cita.cliente) ? cita : undefined,
  });
  cita.cliente = patientIdentity.nombre;
  cita.pacienteId = patientIdentity.pacienteId;
  cita.rol = rolNormalizado;
  cita.profesional = profesionalDoc._id;
  cita.servicio = serviciosValidos;
  cita.fecha = fechaObj;

  await citaRepository.save(cita);

  const citaActualizada = await citaRepository.findByIdPopulated(id);
  return citaActualizada;
};

const eliminarCita = async (id, actor) => {
  assertAuthenticatedStaff(actor);
  validateCitaId(id);
  const cita = await citaRepository.findById(id);
  if (!cita) {
    throw new AppError("Cita no encontrada", 404);
  }

  assertCanManageCita(actor, cita);
  const citaEliminada = await citaRepository.deleteById(id);
  return citaEliminada;
};

const actualizarEstadoCita = async (id, estado, actor) => {
  assertAuthenticatedStaff(actor);
  validateCitaId(id);
  if (!ESTADOS_CITA_VALIDOS.includes(estado)) {
    throw new AppError("Estado inválido", 400);
  }

  const cita = await citaRepository.findById(id);
  if (!cita) {
    throw new AppError("Cita no encontrada", 404);
  }

  assertCanManageCita(actor, cita);

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

const buscarPacientes = async (nombre, actor) => {
  assertAuthenticatedStaff(actor);
  const nombreLimpio = String(nombre || "").trim().slice(0, 80);
  if (!nombreLimpio) return [];

  const patientRegex = escapeRegex(nombreLimpio);
  const citas = actor.rol === "doctor"
    ? await citaRepository.searchByClientNameAndProfesional(patientRegex, actor.id)
    : await citaRepository.searchByClientName(patientRegex);

  const pacientesUnicos = new Map();
  for (const cita of citas) {
    const nombre = String(cita.cliente || "").trim();
    if (!nombre) continue;

    const pacienteId = getRecordId(cita.pacienteId);
    const citaId = getRecordId(cita);
    const tieneIdentidad = OBJECT_ID_REGEX.test(pacienteId) && OBJECT_ID_REGEX.test(citaId);
    const clave = tieneIdentidad ? `paciente:${pacienteId}` : `nombre:${normalizeName(nombre)}`;
    if (!pacientesUnicos.has(clave)) {
      pacientesUnicos.set(clave, {
        nombre,
        ...(tieneIdentidad ? { citaPacienteId: citaId } : {}),
      });
    }
    if (pacientesUnicos.size === 10) break;
  }

  return [...pacientesUnicos.values()];
};

module.exports = {
  obtenerCitas,
  crearCita,
  actualizarCita,
  eliminarCita,
  actualizarEstadoCita,
  buscarPacientes,
};
