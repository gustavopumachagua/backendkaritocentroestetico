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

router.get("/", authMiddleware, obtenerCitas);
router.get("/buscar", authMiddleware, buscarPacientes);
router.post("/", authMiddleware, crearCita);
router
  .route("/:id")
  .put(authMiddleware, actualizarCita)
  .delete(authMiddleware, eliminarCita);
router
  .route("/:id/estado")
  .patch(authMiddleware, actualizarEstadoCita)
  .put(authMiddleware, actualizarEstadoCita);

module.exports = router;
