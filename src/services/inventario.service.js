const inventarioRepository = require("../repositories/inventario.repository");
const AppError = require("../errors/AppError");
const { OBJECT_ID_REGEX, PROFESSIONAL_ROLES } = require("../constants");

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function requireInventoryRole(value) {
  const role = normalizeRole(value);
  if (!PROFESSIONAL_ROLES.includes(role)) {
    throw new AppError("El rol del inventario no es válido", 400);
  }
  return role;
}

function requireInventoryType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (!["insumo", "servicio"].includes(type)) {
    throw new AppError("El tipo de inventario no es válido", 400);
  }
  return type;
}

function requireName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160) {
    throw new AppError("El nombre del ítem no es válido", 400);
  }
  return value.trim().toLowerCase();
}

function parseInteger(value, fieldName, { min, fallback } = {}) {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new AppError(`${fieldName} es obligatorio`, 400);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new AppError(`${fieldName} no es válido`, 400);
  }
  return parsed;
}

function validateItemId(id) {
  if (!OBJECT_ID_REGEX.test(String(id || ""))) {
    throw new AppError("El ítem de inventario no es válido", 400);
  }
}

function assertCanDiscountInventory(actor, rol) {
  const requestedRole = requireInventoryRole(rol);

  if (!actor || !actor.rol) {
    throw new AppError("No autorizado", 403);
  }

  if (actor.rol !== "administrador" && actor.rol !== requestedRole) {
    throw new AppError("No puedes descontar insumos de otro rol", 403);
  }

  return requestedRole;
}

/**
 * Servicio de lógica de negocio para Inventario.
 */

const obtenerInventario = async (rol, tipo) => {
  const rolNormalizado = requireInventoryRole(rol);

  if (tipo === undefined || tipo === null || tipo === "") {
    return inventarioRepository.findByRol(rolNormalizado);
  }

  return inventarioRepository.findByRolAndTipo(
    rolNormalizado,
    requireInventoryType(tipo),
  );
};

const agregarItem = async ({ rol, tipo, nombre, stock = 0, umbral = 1 }) => {
  const rolNormalizado = requireInventoryRole(rol);
  const tipoNormalizado = requireInventoryType(tipo);
  const nombreNormalizado = requireName(nombre);
  const stockNormalizado = parseInteger(stock, "El stock", {
    min: 0,
    fallback: 0,
  });
  const umbralNormalizado = parseInteger(umbral, "El umbral", {
    min: 1,
    fallback: 1,
  });
  const existente = await inventarioRepository.findByRolTipoNombre(
    rolNormalizado,
    tipoNormalizado,
    nombreNormalizado,
  );

  let item;
  let message;

  if (existente) {
    existente.stock += stockNormalizado;
    existente.umbral = umbralNormalizado;
    await inventarioRepository.save(existente);
    item = existente;
    message = "Stock y umbral actualizados correctamente";
  } else {
    item = await inventarioRepository.create({
      rol: rolNormalizado,
      tipo: tipoNormalizado,
      nombre: nombreNormalizado,
      stock: stockNormalizado,
      umbral: umbralNormalizado,
    });
    message = "Item agregado correctamente";
  }

  return { item, message };
};

const eliminarItem = async (id) => {
  validateItemId(id);
  const eliminado = await inventarioRepository.deleteById(id);
  if (!eliminado) {
    throw new AppError("Item no encontrado", 404);
  }
  return eliminado;
};

const descontarInsumos = async ({ rol, insumos, actor }) => {
  if (!Array.isArray(insumos) || insumos.length === 0) {
    throw new AppError("Lista de insumos inválida", 400);
  }

  const rolNormalizado = assertCanDiscountInventory(actor, rol);

  const actualizados = [];

  for (const rawName of insumos) {
    const nombre = requireName(rawName);
    const insumo = await inventarioRepository.findByRolAndNombre(
      rolNormalizado,
      nombre,
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
  validateItemId(id);
  const item = await inventarioRepository.findById(id);
  if (!item) {
    throw new AppError("Item no encontrado", 404);
  }

  if (nombre !== undefined) item.nombre = requireName(nombre);
  if (item.tipo === "insumo") {
    if (stock !== undefined) {
      item.stock = parseInteger(stock, "El stock", { min: 0 });
    }
    if (umbral !== undefined) {
      item.umbral = parseInteger(umbral, "El umbral", { min: 1 });
    }
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
