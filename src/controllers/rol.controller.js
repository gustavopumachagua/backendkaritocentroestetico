const User = require("../models/User.model");
const sendEmail = require("../utils/sendEmail");
const fs = require("fs");
const path = require("path");

function renderEmailTemplate(templateName, variables = {}) {
  const templatePath = path.join(__dirname, "..", "emails", templateName);
  let html = fs.readFileSync(templatePath, "utf8");

  for (const key in variables) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), variables[key]);
  }

  return html;
}

const crearUsuario = async (req, res) => {
  try {
    const { nombre, email, rol } = req.body;

    if (req.user.rol !== "administrador") {
      return res.status(403).json({ message: "No autorizado" });
    }

    const existe = await User.findOne({ email });
    if (existe) {
      return res.status(400).json({ message: "El correo ya está registrado" });
    }

    const passwordTemporal = Math.random().toString(36).slice(-8);

    const nuevoUsuario = new User({
      nombre,
      email,
      rol: rol.toLowerCase(),
      password: passwordTemporal,
    });

    await nuevoUsuario.save();

    const html = renderEmailTemplate("adminWelcomeEmail.html", {
      nombre,
      email,
      rol,
      password: passwordTemporal,
      loginLink: `${process.env.FRONTEND_URL}/login`,
    });

    await sendEmail({
      to: email,
      subject: `Bienvenido al sistema - Cuenta de ${rol}`,
      html,
    });

    res.status(201).json({
      message: "Usuario creado correctamente",
      usuario: {
        id: nuevoUsuario._id,
        nombre,
        email,
        rol,
        activo: nuevoUsuario.activo,
      },
    });
  } catch (error) {
    console.error("Error al crear usuario:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

module.exports = { actualizarPerfil, crearUsuario };
