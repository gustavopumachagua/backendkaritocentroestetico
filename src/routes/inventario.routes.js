const express = require("express");
const router = express.Router();
const {
  obtenerInventario,
  agregarItem,
  eliminarItem,
  descontarInsumos,
  actualizarItem,
} = require("../controllers/inventario.controller");

router.get("/:rol", obtenerInventario);
router.post("/", agregarItem);
router.delete("/:id", eliminarItem);
router.put("/descontar", descontarInsumos);
router.put("/:id", actualizarItem);

module.exports = router;
