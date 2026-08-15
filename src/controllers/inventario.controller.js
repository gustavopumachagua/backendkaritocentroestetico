const inventarioService = require("../services/inventario.service");
const asyncHandler = require("../helpers/asyncHandler");

/**
 * Controlador de Inventario.
 * Responsabilidad: orquestación HTTP y emisión de eventos Socket.IO.
 */

exports.obtenerInventario = asyncHandler(async (req, res) => {
  const { rol } = req.params;
  const inventario = await inventarioService.obtenerInventario(rol);
  res.json(inventario);
});

exports.agregarItem = asyncHandler(async (req, res) => {
  const { rol, tipo, nombre, stock, umbral } = req.body;
  const { item, message } = await inventarioService.agregarItem({
    rol,
    tipo,
    nombre,
    stock,
    umbral,
  });

  const io = req.app.get("io");
  io.emit("inventarioActualizado", { rol, tipo, action: "agregar", item });

  res.json({ message, item });
});

exports.eliminarItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const eliminado = await inventarioService.eliminarItem(id);

  const io = req.app.get("io");
  io.emit("inventarioActualizado", {
    rol: eliminado.rol,
    tipo: eliminado.tipo,
    action: "eliminar",
    item: eliminado,
  });

  res.json({ message: "Item eliminado correctamente" });
});

exports.descontarInsumos = asyncHandler(async (req, res) => {
  const { rol, insumos } = req.body;
  const actualizados = await inventarioService.descontarInsumos({
    rol,
    insumos,
  });

  res.json({
    message: "Insumos descontados correctamente",
    actualizados,
  });
});

exports.actualizarItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nombre, stock, umbral } = req.body;

  const item = await inventarioService.actualizarItem(id, {
    nombre,
    stock,
    umbral,
  });

  const io = req.app.get("io");
  io.emit("inventarioActualizado", {
    rol: item.rol,
    tipo: item.tipo,
    action: "editar",
    item,
  });

  res.json({ message: "Item actualizado correctamente", item });
});
