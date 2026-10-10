const express = require("express");
const router = express.Router();
const {
  crearCita,
  obtenerCitas,
  actualizarCita,
  actualizarEstadoCita,
  eliminarCita,
  buscarPacientes,
} = require("../controllers/cita.controller");
const authMiddleware = require("../middlewares/authJwt");
const authorizeRole = require("../middlewares/authorizeRole");
const { STAFF_ROLES } = require("../constants");

router.get("/", authMiddleware, authorizeRole(...STAFF_ROLES), obtenerCitas);
router.get("/buscar", authMiddleware, authorizeRole(...STAFF_ROLES), buscarPacientes);
router.post("/", authMiddleware, authorizeRole(...STAFF_ROLES), crearCita);
router
  .route("/:id")
  .put(authMiddleware, authorizeRole(...STAFF_ROLES), actualizarCita)
  .delete(authMiddleware, authorizeRole(...STAFF_ROLES), eliminarCita);
router
  .route("/:id/estado")
  .patch(authMiddleware, authorizeRole(...STAFF_ROLES), actualizarEstadoCita)
  .put(authMiddleware, authorizeRole(...STAFF_ROLES), actualizarEstadoCita);

module.exports = router;
