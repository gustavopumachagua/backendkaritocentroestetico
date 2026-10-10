const express = require("express");
const router = express.Router();
const authJwt = require("../middlewares/authJwt");
const authorizeRole = require("../middlewares/authorizeRole");
const {
  guardarHistoriaClinica,
  obtenerHistoriaPorPaciente,
  obtenerHistoriaPorId,
  listarFinalizadasMedico,
  listarProximosControles,
} = require("../controllers/historiaClinica.controller");

router.use(authJwt);

router.get(
  "/proximos-controles",
  authorizeRole("cosmiatra", "administrador"),
  listarProximosControles,
);

router.get("/finalizadas", authorizeRole("doctor"), listarFinalizadasMedico);

// Consulta y guardado por la identidad compuesta. Para registros nuevos sin
// cita se debe enviar pacienteNombre y, de ser posible, tratamientoId.
router
  .route("/")
  .get(authorizeRole("doctor"), obtenerHistoriaPorPaciente)
  .put(authorizeRole("doctor"), guardarHistoriaClinica);

// Alias práctico para pantallas que ya conocen la cita actual.
router
  .route("/citas/:citaId")
  .get(authorizeRole("doctor"), obtenerHistoriaPorPaciente)
  .put(authorizeRole("doctor"), guardarHistoriaClinica);

router.get("/:id", authorizeRole("doctor"), obtenerHistoriaPorId);

module.exports = router;
