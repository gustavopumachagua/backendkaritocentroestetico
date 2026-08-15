const authService = require("../services/auth.service");
const asyncHandler = require("../helpers/asyncHandler");

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
  res.status(200).json(result);
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const frontendUrl =
    process.env.FRONTEND_URL || req.get("origin") || "";
  const result = await authService.resetPassword({ email, frontendUrl });
  res.status(200).json(result);
});

module.exports = { login, changePassword, resetPassword };
