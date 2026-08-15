const userRepository = require("../repositories/user.repository");
const renderEmailTemplate = require("../helpers/emailTemplateRenderer");
const sendEmail = require("../utils/sendEmail");
const AppError = require("../errors/AppError");

/**
 * Servicio de lógica de negocio para Usuarios.
 */

const crearUsuario = async ({ nombre, email, rol }) => {
  const normalizedEmail = email.trim().toLowerCase();

  const existe = await userRepository.findByEmail(normalizedEmail);
  if (existe) {
    throw new AppError("El correo ya está registrado", 400);
  }

  const passwordTemporal =
    Math.random().toString(36).slice(-10) +
    Math.random().toString(36).slice(-10);

  const nuevoUsuario = await userRepository.create({
    nombre: nombre.trim(),
    email: normalizedEmail,
    rol: rol.toLowerCase(),
    password: passwordTemporal,
  });

  const html = renderEmailTemplate("usuariosWelcomeEmail.html", {
    nombre,
    email: normalizedEmail,
    rol,
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

const actualizarPerfil = async (id, { nombre, avatar }) => {
  if (!nombre) {
    throw new AppError("El nombre es obligatorio", 400);
  }

  const user = await userRepository.updateById(id, { nombre, avatar });
  if (!user) {
    throw new AppError("Usuario no encontrado", 404);
  }

  return {
    id: user._id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    avatar: user.avatar,
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
