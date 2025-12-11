const express = require("express");
const router = express.Router();
const {
  crearTratamiento,
  obtenerTratamientos,
} = require("../controllers/tratamiento.controller");
const authMiddleware = require("../middlewares/authJwt");
const upload = require("../middlewares/upload");

router.get("/", authMiddleware, obtenerTratamientos);
router.post("/", authMiddleware, upload.array("imagenes", 5), crearTratamiento);

router.get("/buscar/:nombre", authMiddleware, async (req, res) => {
  try {
    const { nombre } = req.params;
    const tratamiento = await require("../models/Tratamiento.model").findOne({
      nombre: { $regex: new RegExp(`^${nombre}$`, "i") },
    });

    if (!tratamiento) {
      return res.status(404).json({ message: "Paciente no encontrado" });
    }

    res.json({
      nombre: tratamiento.nombre,
      edad: tratamiento.edad,
      sexo: tratamiento.sexo,
      celular: tratamiento.celular,
    });
  } catch (error) {
    console.error("Error al buscar paciente:", error);
    res.status(500).json({ message: "Error al buscar paciente" });
  }
});

module.exports = router;
