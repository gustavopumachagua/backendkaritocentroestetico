const User = require("../models/User.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const fs = require("fs");
const path = require("path");
const sendEmail = require("../utils/sendEmail");

const RESET_TOKEN_PURPOSE = "password-reset";
const RESET_TOKEN_EXPIRES_IN = "30m";

function renderEmailTemplate(templateName, variables = {}) {
  const templatePath = path.join(__dirname, "..", "emails", templateName);
  let html = fs.readFileSync(templatePath, "utf8");

  for (const key in variables) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), variables[key]);
  }

  return html;
}

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function isPasswordValid(password = "") {
  return (
    typeof password === "string" &&
    password.length >= 6 &&
    !/\s/.test(password)
  );
}

function getResetTokenSecret(user) {
  return `${process.env.JWT_SECRET}:${user.password}`;
}

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        message: "Email y contraseña son requeridos",
      });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      return res.status(400).json({
        message: "Email y contraseña son requeridos",
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({
        message: "Credenciales incorrectas",
      });
    }

    if (!user.activo) {
      return res.status(403).json({
        message: "Tu cuenta ha sido suspendida. Contacta al administrador",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        message: "Credenciales incorrectas",
      });
    }

    const token = jwt.sign(
      { id: user._id, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        avatar: user.avatar || process.env.DEFAULT_AVATAR_URL,
      },
    });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

const changePassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res
        .status(400)
        .json({ message: "Token y nueva contraseña son requeridos" });
    }

    if (!isPasswordValid(newPassword)) {
      return res.status(400).json({
        message: "La contraseña debe tener al menos 6 caracteres y no espacios",
      });
    }

    const decoded = jwt.decode(resetToken);
    if (!decoded?.id || decoded.purpose !== RESET_TOKEN_PURPOSE) {
      return res.status(400).json({ message: "Enlace inválido" });
    }

    const user = await User.findById(decoded.id);
    if (!user || user.email !== decoded.email) {
      return res.status(400).json({ message: "Enlace inválido" });
    }

    jwt.verify(resetToken, getResetTokenSecret(user));

    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    return res
      .status(200)
      .json({ message: "Contraseña cambiada correctamente" });
  } catch (error) {
    console.error("Error al cambiar la contraseña:", error);
    if (error.name === "TokenExpiredError") {
      return res.status(400).json({ message: "El enlace ha expirado" });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(400).json({ message: "Enlace inválido" });
    }

    return res.status(500).json({ message: "Error del servidor" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: "Correo inválido" });
    }

    const successMessage =
      "Si el correo está registrado, recibirás un enlace de restablecimiento";

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(200).json({ message: successMessage });
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
    const frontendUrl = (process.env.FRONTEND_URL || req.get("origin") || "")
      .trim()
      .replace(/\/+$/, "");

    if (!frontendUrl) {
      return res
        .status(500)
        .json({ message: "URL del frontend no configurada" });
    }

    const html = renderEmailTemplate("resetPassword.html", {
      nombre: user.nombre,
      resetLink: `${frontendUrl}/new-password?token=${encodeURIComponent(
        resetToken,
      )}`,
    });

    await sendEmail({
      to: normalizedEmail,
      subject: "Restablecimiento de contraseña",
      html,
    });

    return res.status(200).json({ message: successMessage });
  } catch (error) {
    console.error("Error al enviar el correo:", error);
    return res.status(500).json({ message: "Error al enviar el correo" });
  }
};

module.exports = { login, changePassword, resetPassword };
