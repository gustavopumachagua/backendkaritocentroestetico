const express = require("express");
const router = express.Router();
const {
  actualizarPerfil,
  crearUsuario,
  obtenerUsuarios,
  obtenerProfesionales,
  suspenderUsuario,
  eliminarUsuario,
} = require("../controllers/user.controller");
const authMiddleware = require("../middlewares/authJwt");
const authorizeRole = require("../middlewares/authorizeRole");

router.post(
  "/register",
  authMiddleware,
  authorizeRole("administrador"),
  crearUsuario,
);

router.get("/", authMiddleware, authorizeRole("administrador"), obtenerUsuarios);

router.get("/profesionales", authMiddleware, obtenerProfesionales);

router.put("/:id", authMiddleware, actualizarPerfil);

router.patch(
  "/:id/suspender",
  authMiddleware,
  authorizeRole("administrador"),
  suspenderUsuario,
);

router.delete(
  "/:id",
  authMiddleware,
  authorizeRole("administrador"),
  eliminarUsuario,
);

module.exports = router;
