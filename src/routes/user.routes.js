const express = require("express");
const router = express.Router();
const {
  actualizarPerfil,
  crearUsuario,
  obtenerUsuarios,
  suspenderUsuario,
  eliminarUsuario,
} = require("../controllers/user.controller");
const authMiddleware = require("../middlewares/authJwt");

router.post("/register", authMiddleware, crearUsuario);

router.get("/", authMiddleware, obtenerUsuarios);

router.put("/:id", authMiddleware, actualizarPerfil);

router.patch("/:id/suspender", authMiddleware, suspenderUsuario);

router.delete("/:id", authMiddleware, eliminarUsuario);

router.get("/profesionales", authMiddleware, async (req, res) => {
  try {
    const profesionales = await require("../models/User.model")
      .find({ rol: { $in: ["doctor", "cosmiatra"] }, activo: true })
      .select("-password");
    res.json(profesionales);
  } catch (error) {
    console.error("Error al obtener profesionales:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

module.exports = router;
