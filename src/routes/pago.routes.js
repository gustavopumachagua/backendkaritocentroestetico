const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authJwt");
const {
  registrarPago,
  obtenerPagos,
  obtenerPagosPorCita,
} = require("../controllers/pago.controller");

router.post("/", authMiddleware, registrarPago);

router.get("/", authMiddleware, obtenerPagos);

router.get("/:citaId", authMiddleware, obtenerPagosPorCita);

module.exports = router;
