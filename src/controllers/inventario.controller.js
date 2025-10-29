const Inventario = require("../models/Inventario.model");

exports.obtenerInventario = async (req, res) => {
  try {
    const { rol } = req.params;
    const inventario = await Inventario.find({ rol });
    res.json(inventario);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener inventario" });
  }
};

exports.agregarItem = async (req, res) => {
  try {
    const { rol, tipo, nombre, stock = 0, umbral = 1 } = req.body;

    if (!nombre || !rol || !tipo)
      return res.status(400).json({ message: "Datos incompletos" });

    const nombreNormalizado = nombre.trim().toLowerCase();
    const existente = await Inventario.findOne({
      rol,
      tipo,
      nombre: nombreNormalizado,
    });

    let item;
    let message;

    if (existente) {
      existente.stock += parseInt(stock);
      existente.umbral = parseInt(umbral);
      await existente.save();
      item = existente;
      message = "Stock y umbral actualizados correctamente";
    } else {
      const nuevoItem = new Inventario({
        rol,
        tipo,
        nombre: nombreNormalizado,
        stock,
        umbral,
      });
      await nuevoItem.save();
      item = nuevoItem;
      message = "Item agregado correctamente";
    }

    const io = req.app.get("io");
    io.emit("inventarioActualizado", { rol, tipo, action: "agregar", item });

    res.json({ message, item });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al agregar item" });
  }
};

exports.eliminarItem = async (req, res) => {
  try {
    const { id } = req.params;
    const eliminado = await Inventario.findByIdAndDelete(id);
    if (!eliminado)
      return res.status(404).json({ message: "Item no encontrado" });

    const io = req.app.get("io");
    io.emit("inventarioActualizado", {
      rol: eliminado.rol,
      tipo: eliminado.tipo,
      action: "eliminar",
      item: eliminado,
    });

    res.json({ message: "Item eliminado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al eliminar item" });
  }
};

exports.descontarInsumos = async (req, res) => {
  try {
    const { rol, insumos } = req.body;

    if (!Array.isArray(insumos) || insumos.length === 0) {
      return res.status(400).json({ message: "Lista de insumos inválida" });
    }

    const actualizados = [];

    for (const nombre of insumos) {
      const insumo = await Inventario.findOne({
        rol,
        nombre: nombre.toLowerCase(),
      });
      if (!insumo) continue;

      if (insumo.stock > 0) {
        insumo.stock -= 1;
        await insumo.save();
        actualizados.push(insumo);
      }
    }

    res.json({
      message: "Insumos descontados correctamente",
      actualizados,
    });
  } catch (error) {
    console.error("Error al descontar insumos:", error);
    res.status(500).json({ message: "Error al descontar insumos" });
  }
};

exports.actualizarItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, stock, umbral } = req.body;

    const item = await Inventario.findById(id);
    if (!item) return res.status(404).json({ message: "Item no encontrado" });

    if (nombre) item.nombre = nombre.toLowerCase();
    if (item.tipo === "insumo") {
      if (stock !== undefined) item.stock = parseInt(stock);
      if (umbral !== undefined) item.umbral = parseInt(umbral);
    }

    await item.save();

    const io = req.app.get("io");
    io.emit("inventarioActualizado", {
      rol: item.rol,
      tipo: item.tipo,
      action: "editar",
      item,
    });

    res.json({ message: "Item actualizado correctamente", item });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al actualizar item" });
  }
};
