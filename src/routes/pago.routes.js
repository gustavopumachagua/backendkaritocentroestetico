const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authJwt");
const authorizeRole = require("../middlewares/authorizeRole");
const { STAFF_ROLES, PAYMENT_ROLES } = require("../constants");
const {
  registrarPago,
  obtenerPagos,
  obtenerPagosPorCita,
} = require("../controllers/pago.controller");

router.post(
  "/",
  authMiddleware,
  authorizeRole(...PAYMENT_ROLES),
  registrarPago,
);

router.get(
  "/",
  authMiddleware,
  authorizeRole(...STAFF_ROLES),
  obtenerPagos,
);

router.get(
  "/:citaId",
  authMiddleware,
  authorizeRole(...STAFF_ROLES),
  obtenerPagosPorCita,
);

module.exports = router;
