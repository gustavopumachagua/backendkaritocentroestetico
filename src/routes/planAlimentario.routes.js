const express = require("express");
const authJwt = require("../middlewares/authJwt");
const authorizeRole = require("../middlewares/authorizeRole");
const { createRateLimiter } = require("../middlewares/rateLimit");
const controller = require("../controllers/planAlimentario.controller");
const router = express.Router();

router.use(authJwt, authorizeRole("cosmiatra"), createRateLimiter({
  windowMs: 60_000, max: 120, keyGenerator: (req) => `plan:${req.user.id}`,
  message: "Demasiadas solicitudes de planes alimentarios. Espera un momento e inténtalo nuevamente.",
}));
router.get("/seguimientos", controller.listarSeguimientos);
router.get("/:historiaId", controller.obtenerPlan);
router.put("/:historiaId", controller.guardarPlan);

module.exports = router;
