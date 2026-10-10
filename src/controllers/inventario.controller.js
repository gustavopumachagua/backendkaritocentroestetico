const inventarioService = require("../services/inventario.service");
const asyncHandler = require("../helpers/asyncHandler");
const { emitInventarioEvent } = require("../helpers/realtimeEmitter");
const AppError = require("../errors/AppError");

/**
 * Controlador de Inventario.
 * Responsabilidad: orquestación HTTP y emisión de eventos Socket.IO.
 */

exports.obtenerInventario = asyncHandler(async (req, res) => {
  const rol = String(req.params.rol || "").trim().toLowerCase();
  const actorRole = String(req.user?.rol || "").trim().toLowerCase();
  const tipo = req.query.tipo;
  const consultaCatalogoServicios =
    actorRole === "cosmiatra" &&
    String(tipo || "").trim().toLowerCase() === "servicio";

  // A cosmiatra needs to see the service catalogue for either specialty when
  // registering an appointment. It must not gain access to stock or supplies
  // belonging to the other specialty.
  if (
    actorRole !== "administrador" &&
    actorRole !== rol &&
    !consultaCatalogoServicios
  ) {
    throw new AppError("No puedes consultar el inventario de otro rol", 403);
  }

  const inventario = await inventarioService.obtenerInventario(rol, tipo);

  // The appointment form needs names only. Returning a small service catalog
  // prevents this cross-specialty read from exposing inventory quantities.
  if (consultaCatalogoServicios) {
    return res.json(
      inventario.map((item) => ({
        _id: item._id,
        rol: item.rol,
        tipo: item.tipo,
        nombre: item.nombre,
      })),
    );
  }

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

  emitInventarioEvent(req.app.get("io"), "inventarioActualizado", {
    rol: item.rol,
    tipo: item.tipo,
    action: "agregar",
    item,
  });

  res.json({ message, item });
});

exports.eliminarItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const eliminado = await inventarioService.eliminarItem(id);

  emitInventarioEvent(req.app.get("io"), "inventarioActualizado", {
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
    actor: req.user,
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

  emitInventarioEvent(req.app.get("io"), "inventarioActualizado", {
    rol: item.rol,
    tipo: item.tipo,
    action: "editar",
    item,
  });

  res.json({ message: "Item actualizado correctamente", item });
});
