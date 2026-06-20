const express = require("express");
const router = express.Router();
const {
  crearTratamiento,
  obtenerTratamientos,
} = require("../controllers/tratamiento.controller");
const authMiddleware = require("../middlewares/authJwt");
const upload = require("../middlewares/upload");
const escapeRegex = require("../utils/escapeRegex");

router.get("/", authMiddleware, obtenerTratamientos);
router.post("/", authMiddleware, upload.array("imagenes", 5), crearTratamiento);

router.get("/buscar/:nombre", authMiddleware, async (req, res) => {
  try {
    const nombre = String(req.params.nombre || "").trim().slice(0, 80);
    const tratamiento = await require("../models/Tratamiento.model").findOne({
      nombre: { $regex: new RegExp(`^${escapeRegex(nombre)}$`, "i") },
    });

    if (!tratamiento) {
      return res.status(404).json({ message: "Paciente no encontrado" });
    }

    res.json({
      nombre: tratamiento.nombre,
      sexo: tratamiento.sexo,
      celular: tratamiento.celular,
    });
  } catch (error) {
    console.error("Error al buscar paciente:", error);
    res.status(500).json({ message: "Error al buscar paciente" });
  }
});

module.exports = router;
