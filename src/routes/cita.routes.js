const Cita = require("../models/Cita.model");
const express = require("express");
const router = express.Router();
const escapeRegex = require("../utils/escapeRegex");
const {
  crearCita,
  obtenerCitas,
  actualizarCita,
  actualizarEstadoCita,
  eliminarCita,
} = require("../controllers/cita.controller");
const authMiddleware = require("../middlewares/authJwt");

router.get("/", authMiddleware, obtenerCitas);
router.post("/", authMiddleware, crearCita);
router
  .route("/:id")
  .put(authMiddleware, actualizarCita)
  .delete(authMiddleware, eliminarCita);
router
  .route("/:id/estado")
  .patch(authMiddleware, actualizarEstadoCita)
  .put(authMiddleware, actualizarEstadoCita);

router.get("/buscar", authMiddleware, async (req, res) => {
  try {
    const nombre = String(req.query.nombre || "").trim().slice(0, 80);
    if (!nombre) return res.json([]);

    const citas = await Cita.find({
      cliente: { $regex: escapeRegex(nombre), $options: "i" },
    }).limit(10);

    const nombresUnicos = [...new Set(citas.map((c) => c.cliente))].map(
      (n) => ({
        nombre: n,
      })
    );
    res.json(nombresUnicos);
  } catch (error) {
    console.error("Error al buscar pacientes:", error);
    res.status(500).json({ message: "Error al buscar pacientes" });
  }
});

module.exports = router;
