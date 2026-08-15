const express = require("express");
const router = express.Router();
const {
  crearTratamiento,
  obtenerTratamientos,
  buscarPaciente,
} = require("../controllers/tratamiento.controller");
const authMiddleware = require("../middlewares/authJwt");
const upload = require("../middlewares/upload");

router.get("/", authMiddleware, obtenerTratamientos);
router.post("/", authMiddleware, upload.array("imagenes", 5), crearTratamiento);
router.get("/buscar/:nombre", authMiddleware, buscarPaciente);

module.exports = router;
