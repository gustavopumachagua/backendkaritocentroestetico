const userService = require("../services/user.service");
const asyncHandler = require("../helpers/asyncHandler");
const AppError = require("../errors/AppError");
const { disconnectUserSockets, emitProfessionalUpdatedEvent } = require("../helpers/realtimeEmitter");

/**
 * Controlador de Usuarios.
 * Responsabilidad: orquestación HTTP.
 * La autorización por rol se maneja ahora con el middleware authorizeRole.
 */

const actualizarPerfil = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (req.user.id !== id) {
    throw new AppError("No tienes permiso para editar este perfil", 403);
  }

  const { nombre, cmp } = req.body;

  // Las URLs de avatar se actualizan exclusivamente por /api/upload, que
  // valida el archivo antes de persistirlo. No aceptar una URL arbitraria
  // aquí evita que el perfil se convierta en un almacén de contenido remoto.
  const user = await userService.actualizarPerfil(id, { nombre, cmp });
  emitProfessionalUpdatedEvent(req.app.get("io"), user);

  res.json({
    message: "Perfil actualizado correctamente",
    user,
  });
});

const crearUsuario = asyncHandler(async (req, res) => {
  const { nombre, email, rol } = req.body;
  const usuario = await userService.crearUsuario({ nombre, email, rol });

  res.status(201).json({
    message: "Usuario creado correctamente",
    usuario,
  });
});

const obtenerUsuarios = asyncHandler(async (req, res) => {
  const usuarios = await userService.obtenerUsuarios();
  res.json(usuarios);
});

const obtenerProfesionales = asyncHandler(async (req, res) => {
  const profesionales = await userService.obtenerProfesionales();
  res.json(profesionales);
});

const suspenderUsuario = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const usuario = await userService.suspenderUsuario(id);

  if (!usuario.activo) {
    disconnectUserSockets(req.app.get("io"), usuario.id);
  }

  res.json({
    message: `Usuario ${
      usuario.activo ? "activado" : "suspendido"
    } correctamente`,
    usuario,
  });
});

const eliminarUsuario = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const usuarioEliminado = await userService.eliminarUsuario(id);
  disconnectUserSockets(req.app.get("io"), usuarioEliminado);

  res.json({
    message: "Usuario eliminado correctamente",
    usuarioEliminado,
  });
});

module.exports = {
  actualizarPerfil,
  crearUsuario,
  obtenerUsuarios,
  obtenerProfesionales,
  suspenderUsuario,
  eliminarUsuario,
};
