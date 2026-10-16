const express = require("express");
const router = express.Router();
const {
  crearTratamiento,
  obtenerTratamientos,
  obtenerHistorialAtenciones,
  obtenerTratamientosParaReporteServicios,
  buscarPaciente,
  obtenerPacientePorCita,
} = require("../controllers/tratamiento.controller");
const authMiddleware = require("../middlewares/authJwt");
const authorizeRole = require("../middlewares/authorizeRole");
const upload = require("../middlewares/upload");
const { STAFF_ROLES, PROFESSIONAL_ROLES } = require("../constants");

router.get(
  "/historial-atenciones",
  authMiddleware,
  authorizeRole(...STAFF_ROLES),
  obtenerHistorialAtenciones,
);

router.get(
  "/reporte-servicios",
  authMiddleware,
  authorizeRole("cosmiatra", "administrador"),
  obtenerTratamientosParaReporteServicios,
);

router.get(
  "/",
  authMiddleware,
  authorizeRole(...STAFF_ROLES),
  obtenerTratamientos,
);
router.post(
  "/",
  authMiddleware,
  authorizeRole(...PROFESSIONAL_ROLES),
  upload.array("imagenes", 5),
  crearTratamiento,
);
router.get(
  "/paciente-por-cita/:citaId",
  authMiddleware,
  authorizeRole(...PROFESSIONAL_ROLES),
  obtenerPacientePorCita,
);
router.get(
  "/buscar/:nombre",
  authMiddleware,
  authorizeRole(...PROFESSIONAL_ROLES),
  buscarPaciente,
);

module.exports = router;
