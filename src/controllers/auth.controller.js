const authService = require("../services/auth.service");
const asyncHandler = require("../helpers/asyncHandler");
const { disconnectUserSockets } = require("../helpers/realtimeEmitter");

/**
 * Controlador de autenticación.
 * Responsabilidad: extraer datos del request, delegar al service,
 * y formatear la respuesta HTTP.
 */

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login({ email, password });
  res.json(result);
});

const changePassword = asyncHandler(async (req, res) => {
  const { resetToken, newPassword } = req.body;
  const result = await authService.changePassword({ resetToken, newPassword });
  disconnectUserSockets(req.app.get("io"), result.userId);
  res.status(200).json({ message: result.message });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  // Never use a request-controlled Origin to build a password-reset link.
  // A local fallback keeps the development flow usable; production must set
  // FRONTEND_URL explicitly.
  const frontendUrl =
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:4173" : "");
  const result = await authService.resetPassword({ email, frontendUrl });
  res.status(200).json(result);
});

module.exports = { login, changePassword, resetPassword };
