const userService = require("../services/user.service");
const asyncHandler = require("../helpers/asyncHandler");

/**
 * Controlador de Usuarios.
 * Responsabilidad: orquestación HTTP.
 * La autorización por rol se maneja ahora con el middleware authorizeRole.
 */

const actualizarPerfil = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nombre, avatar } = req.body;

  const user = await userService.actualizarPerfil(id, { nombre, avatar });

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
