const userRepository = require("../repositories/user.repository");
const historiaClinicaService = require("./historiaClinica.service");
const tratamientoService = require("./tratamiento.service");
const crypto = require("crypto");
const renderEmailTemplate = require("../helpers/emailTemplateRenderer");
const sendEmail = require("../utils/sendEmail");
const AppError = require("../errors/AppError");
const { USER_ROLES } = require("../constants");

const ALLOWED_USER_ROLES = new Set(USER_ROLES);
const PROFESSIONAL_ROLES = new Set(["doctor", "cosmiatra"]);

function requireText(value, fieldName, maxLength = 160) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(`${fieldName} es obligatorio`, 400);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new AppError(`${fieldName} supera el tamaño permitido`, 400);
  }
  return text;
}

function normalizeEmail(value) {
  const email = requireText(value, "El correo", 254).toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("Correo inválido", 400);
  }
  return email;
}

/**
 * Servicio de lógica de negocio para Usuarios.
 */

const crearUsuario = async ({ nombre, email, rol }) => {
  const normalizedName = requireText(nombre, "El nombre");
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = requireText(rol, "El rol").toLowerCase();

  if (!ALLOWED_USER_ROLES.has(normalizedRole)) {
    throw new AppError("Rol inválido", 400);
  }

  const existe = await userRepository.findByEmail(normalizedEmail);
  if (existe) {
    throw new AppError("El correo ya está registrado", 400);
  }

  // The generated password must not be predictable. The user-facing flow is
  // unchanged; a future activation-token flow can replace email delivery.
  const passwordTemporal = crypto.randomBytes(24).toString("base64url");

  const nuevoUsuario = await userRepository.create({
    nombre: normalizedName,
    email: normalizedEmail,
    rol: normalizedRole,
    password: passwordTemporal,
  });

  const html = renderEmailTemplate("usuariosWelcomeEmail.html", {
    nombre: normalizedName,
    email: normalizedEmail,
    rol: normalizedRole,
    password: passwordTemporal,
    loginLink: `${process.env.FRONTEND_URL}/login`,
  });

  await sendEmail({
    to: normalizedEmail,
    subject: `Bienvenido al sistema - Cuenta de ${rol}`,
    html,
  });

  return {
    id: nuevoUsuario._id,
    nombre: nuevoUsuario.nombre,
    email: nuevoUsuario.email,
    rol: nuevoUsuario.rol,
    activo: nuevoUsuario.activo,
  };
};

const obtenerUsuarios = async () => {
  return userRepository.findAll();
};

const obtenerProfesionales = async () => {
  return userRepository.findProfesionales();
};

const actualizarPerfil = async (id, { nombre, cmp }) => {
  const normalizedName = requireText(nombre, "El nombre");

  if (cmp !== undefined && cmp !== null && !/^\d{6}$/.test(cmp)) {
    throw new AppError("El CMP debe ser un número de exactamente 6 dígitos", 400);
  }

  const updateData = { nombre: normalizedName };
  if (cmp !== undefined) updateData.cmp = cmp;

  // Keep the prior identity before changing the profile. It is only used to
  // migrate genuinely legacy treatment rows that have no immutable owner id.
  const previousUser = await userRepository.findById(id);
  if (!previousUser) {
    throw new AppError("Usuario no encontrado", 404);
  }

  const previousRole = String(previousUser.rol || "").toLowerCase();
  const profileNameChanged =
    String(previousUser.nombre || "").trim().localeCompare(normalizedName, "es", {
      sensitivity: "accent",
    }) !== 0;
  const previousName = PROFESSIONAL_ROLES.has(previousRole) && profileNameChanged
    ? String(previousUser.nombre || "").trim()
    : "";
  const user = await userRepository.updateProfileById(id, updateData, previousName);
  if (!user) {
    throw new AppError("Usuario no encontrado", 404);
  }

  const role = String(user.rol || "").toLowerCase();
  const synchronizations = [];

  if (PROFESSIONAL_ROLES.has(role)) {
    synchronizations.push(
      tratamientoService.sincronizarIdentidadProfesional({
        user,
      }),
    );
  }

  // A clinical PDF is generated from the persisted history, not from the
  // browser form. Keep the doctor's document metadata current while leaving
  // every clinical response untouched.
  if (role === "doctor") {
    synchronizations.push(
      historiaClinicaService.sincronizarDatosMedicoEnHistorias(user),
    );
  }

  await Promise.all(synchronizations);

  return {
    id: user._id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    avatar: user.avatar,
    cmp: user.cmp,
    firmaDigital: user.firmaDigital,
  };
};

const suspenderUsuario = async (id) => {
  const user = await userRepository.findById(id);
  if (!user) {
    throw new AppError("Usuario no encontrado", 404);
  }

  if (user.rol === "administrador") {
    throw new AppError("No se puede suspender un administrador", 403);
  }

  user.activo = !user.activo;
  await user.save();

  return {
    id: user._id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    activo: user.activo,
  };
};

const eliminarUsuario = async (id) => {
  const user = await userRepository.findById(id);
  if (!user) {
    throw new AppError("Usuario no encontrado", 404);
  }

  if (user.rol === "administrador") {
    throw new AppError("No se puede eliminar un administrador", 403);
  }

  await userRepository.deleteById(id);
  return id;
};

module.exports = {
  crearUsuario,
  obtenerUsuarios,
  obtenerProfesionales,
  actualizarPerfil,
  suspenderUsuario,
  eliminarUsuario,
};
