const inventarioRepository = require("../repositories/inventario.repository");
const AppError = require("../errors/AppError");

/**
 * Servicio de lógica de negocio para Inventario.
 */

const obtenerInventario = async (rol) => {
  return inventarioRepository.findByRol(rol);
};

const agregarItem = async ({ rol, tipo, nombre, stock = 0, umbral = 1 }) => {
  if (!nombre || !rol || !tipo) {
    throw new AppError("Datos incompletos", 400);
  }

  const nombreNormalizado = nombre.trim().toLowerCase();
  const existente = await inventarioRepository.findByRolTipoNombre(
    rol,
    tipo,
    nombreNormalizado,
  );

  let item;
  let message;

  if (existente) {
    existente.stock += parseInt(stock);
    existente.umbral = parseInt(umbral);
    await inventarioRepository.save(existente);
    item = existente;
    message = "Stock y umbral actualizados correctamente";
  } else {
    item = await inventarioRepository.create({
      rol,
      tipo,
      nombre: nombreNormalizado,
      stock,
      umbral,
    });
    message = "Item agregado correctamente";
  }

  return { item, message };
};

const eliminarItem = async (id) => {
  const eliminado = await inventarioRepository.deleteById(id);
  if (!eliminado) {
    throw new AppError("Item no encontrado", 404);
  }
  return eliminado;
};

const descontarInsumos = async ({ rol, insumos }) => {
  if (!Array.isArray(insumos) || insumos.length === 0) {
    throw new AppError("Lista de insumos inválida", 400);
  }

  const actualizados = [];

  for (const nombre of insumos) {
    const insumo = await inventarioRepository.findByRolAndNombre(
      rol,
      nombre.toLowerCase(),
    );
    if (!insumo) continue;

    if (insumo.stock > 0) {
      insumo.stock -= 1;
      await inventarioRepository.save(insumo);
      actualizados.push(insumo);
    }
  }

  return actualizados;
};

const actualizarItem = async (id, { nombre, stock, umbral }) => {
  const item = await inventarioRepository.findById(id);
  if (!item) {
    throw new AppError("Item no encontrado", 404);
  }

  if (nombre) item.nombre = nombre.toLowerCase();
  if (item.tipo === "insumo") {
    if (stock !== undefined) item.stock = parseInt(stock);
    if (umbral !== undefined) item.umbral = parseInt(umbral);
  }

  await inventarioRepository.save(item);
  return item;
};

module.exports = {
  obtenerInventario,
  agregarItem,
  eliminarItem,
  descontarInsumos,
  actualizarItem,
};
