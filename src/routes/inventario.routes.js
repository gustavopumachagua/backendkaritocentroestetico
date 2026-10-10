const express = require("express");
const router = express.Router();
const {
  obtenerInventario,
  agregarItem,
  eliminarItem,
  descontarInsumos,
  actualizarItem,
} = require("../controllers/inventario.controller");
const authJwt = require("../middlewares/authJwt");
const authorizeRole = require("../middlewares/authorizeRole");
const { STAFF_ROLES } = require("../constants");

router.use(authJwt);

// Any authenticated staff member can consult catalogue entries needed to
// schedule or deliver a service. Changes to catalogue stock stay limited to
// administrators, while a professional may only discount their own supplies.
router.get("/:rol", authorizeRole(...STAFF_ROLES), obtenerInventario);
router.post("/", authorizeRole("administrador"), agregarItem);
router.delete("/:id", authorizeRole("administrador"), eliminarItem);
router.put(
  "/descontar",
  authorizeRole("doctor", "cosmiatra", "administrador"),
  descontarInsumos,
);
router.put("/:id", authorizeRole("administrador"), actualizarItem);

module.exports = router;
