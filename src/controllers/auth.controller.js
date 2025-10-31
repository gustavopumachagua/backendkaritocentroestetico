const User = require("../models/User.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const fs = require("fs");
const path = require("path");
const sendEmail = require("../utils/sendEmail");

function renderEmailTemplate(templateName, variables = {}) {
  const templatePath = path.join(__dirname, "..", "emails", templateName);
  let html = fs.readFileSync(templatePath, "utf8");

  for (const key in variables) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), variables[key]);
  }

  return html;
}

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email y contraseña son requeridos",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

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
    const { email, newPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "Usuario no encontrado" });

    user.password = newPassword;
    await user.save();

    return res
      .status(200)
      .json({ message: "Contraseña cambiada correctamente" });
  } catch (error) {
    console.error("Error al cambiar la contraseña:", error);
    return res.status(500).json({ message: "Error del servidor" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "Usuario no encontrado" });

    const html = renderEmailTemplate("resetPassword.html", {
      nombre: user.nombre,
      resetLink: `${
        process.env.FRONTEND_URL
      }/new-password?email=${encodeURIComponent(email)}`,
    });

    await sendEmail({
      to: email,
      subject: "Restablecimiento de contraseña",
      html,
    });

    return res
      .status(200)
      .json({ message: "Correo de restablecimiento enviado" });
  } catch (error) {
    console.error("Error al enviar el correo:", error);
    return res.status(500).json({ message: "Error al enviar el correo" });
  }
};

module.exports = { login, changePassword, resetPassword };
