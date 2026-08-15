const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const userRepository = require("../repositories/user.repository");
const renderEmailTemplate = require("../helpers/emailTemplateRenderer");
const sendEmail = require("../utils/sendEmail");
const AppError = require("../errors/AppError");
const {
  RESET_TOKEN_PURPOSE,
  RESET_TOKEN_EXPIRES_IN,
  LOGIN_TOKEN_EXPIRES_IN,
  MIN_PASSWORD_LENGTH,
} = require("../constants");

/**
 * Servicio de autenticación.
 * Contiene toda la lógica de negocio de login, reset y cambio de contraseña.
 */

// ─── Helpers privados ────────────────────────────────────────────────────────

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function isPasswordValid(password = "") {
  return (
    typeof password === "string" &&
    password.length >= MIN_PASSWORD_LENGTH &&
    !/\s/.test(password)
  );
}

function getResetTokenSecret(user) {
  return `${process.env.JWT_SECRET}:${user.password}`;
}

// ─── Login ───────────────────────────────────────────────────────────────────

const login = async ({ email, password }) => {
  if (typeof email !== "string" || typeof password !== "string") {
    throw new AppError("Email y contraseña son requeridos", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    throw new AppError("Email y contraseña son requeridos", 400);
  }

  const user = await userRepository.findByEmail(normalizedEmail);
  if (!user) {
    throw new AppError("Credenciales incorrectas", 400);
  }

  if (!user.activo) {
    throw new AppError(
      "Tu cuenta ha sido suspendida. Contacta al administrador",
      403,
    );
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new AppError("Credenciales incorrectas", 400);
  }

  const token = jwt.sign(
    { id: user._id, rol: user.rol },
    process.env.JWT_SECRET,
    { expiresIn: LOGIN_TOKEN_EXPIRES_IN },
  );

  return {
    token,
    user: {
      id: user._id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      avatar: user.avatar || process.env.DEFAULT_AVATAR_URL,
    },
  };
};

// ─── Reset Password ──────────────────────────────────────────────────────────

const resetPassword = async ({ email, frontendUrl }) => {
  const normalizedEmail = normalizeEmail(email);
  const successMessage =
    "Si el correo está registrado, recibirás un enlace de restablecimiento";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AppError("Correo inválido", 400);
  }

  const user = await userRepository.findByEmail(normalizedEmail);
  if (!user) {
    return { message: successMessage };
  }

  const resetToken = jwt.sign(
    {
      id: user._id,
      email: user.email,
      purpose: RESET_TOKEN_PURPOSE,
    },
    getResetTokenSecret(user),
    { expiresIn: RESET_TOKEN_EXPIRES_IN },
  );

  const resolvedUrl = (frontendUrl || "").trim().replace(/\/+$/, "");
  if (!resolvedUrl) {
    throw new AppError("URL del frontend no configurada", 500);
  }

  const html = renderEmailTemplate("resetPassword.html", {
    nombre: user.nombre,
    resetLink: `${resolvedUrl}/new-password?token=${encodeURIComponent(resetToken)}`,
  });

  await sendEmail({
    to: normalizedEmail,
    subject: "Restablecimiento de contraseña",
    html,
  });

  return { message: successMessage };
};

// ─── Change Password ─────────────────────────────────────────────────────────

const changePassword = async ({ resetToken, newPassword }) => {
  if (!resetToken || !newPassword) {
    throw new AppError("Token y nueva contraseña son requeridos", 400);
  }

  if (!isPasswordValid(newPassword)) {
    throw new AppError(
      "La contraseña debe tener al menos 6 caracteres y no espacios",
      400,
    );
  }

  const decoded = jwt.decode(resetToken);
  if (!decoded?.id || decoded.purpose !== RESET_TOKEN_PURPOSE) {
    throw new AppError("Enlace inválido", 400);
  }

  const user = await userRepository.findById(decoded.id);
  if (!user || user.email !== decoded.email) {
    throw new AppError("Enlace inválido", 400);
  }

  try {
    jwt.verify(resetToken, getResetTokenSecret(user));
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new AppError("El enlace ha expirado", 400);
    }
    throw new AppError("Enlace inválido", 400);
  }

  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();

  return { message: "Contraseña cambiada correctamente" };
};

module.exports = { login, resetPassword, changePassword };
