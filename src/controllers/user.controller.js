const User = require("../models/User.model");

const actualizarPerfil = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, avatar } = req.body;

    if (!nombre) {
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { nombre, avatar },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json({
      message: "Perfil actualizado correctamente",
      user: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Error al actualizar perfil:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

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

    const normalizedEmail = email.trim().toLowerCase();

    const existe = await User.findOne({ email: normalizedEmail });
    if (existe) {
      return res.status(400).json({ message: "El correo ya está registrado" });
    }

    const passwordTemporal =
      Math.random().toString(36).slice(-10) +
      Math.random().toString(36).slice(-10);

    const nuevoUsuario = new User({
      nombre: nombre.trim(),
      email: normalizedEmail,
      rol: rol.toLowerCase(),
      password: passwordTemporal,
    });

    await nuevoUsuario.save();

    const html = renderEmailTemplate("usuariosWelcomeEmail.html", {
      nombre,
      email: normalizedEmail,
      rol,
      password: passwordTemporal,
      loginLink: `${process.env.FRONTEND_URL}/login`,
    });

    await sendEmail({
      to: normalizedEmail,
      subject: `Bienvenido al sistema - Cuenta de ${rol}`,
      html,
    });

    res.status(201).json({
      message: "Usuario creado correctamente",
      usuario: {
        id: nuevoUsuario._id,
        nombre: nuevoUsuario.nombre,
        email: nuevoUsuario.email,
        rol: nuevoUsuario.rol,
        activo: nuevoUsuario.activo,
      },
    });
  } catch (error) {
    console.error("❌ Error al crear usuario:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

const obtenerUsuarios = async (req, res) => {
  try {
    if (req.user.rol !== "administrador")
      return res.status(403).json({ message: "No autorizado" });

    const usuarios = await User.find().select("-password");
    res.json(usuarios);
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

const suspenderUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.rol !== "administrador") {
      return res.status(403).json({ message: "No autorizado" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (user.rol === "administrador") {
      return res
        .status(403)
        .json({ message: "No se puede suspender un administrador" });
    }

    user.activo = !user.activo;
    await user.save();

    res.json({
      message: `Usuario ${
        user.activo ? "activado" : "suspendido"
      } correctamente`,
      usuario: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        activo: user.activo,
      },
    });
  } catch (error) {
    console.error("Error al suspender usuario:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

const eliminarUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.rol !== "administrador") {
      return res.status(403).json({ message: "No autorizado" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (user.rol === "administrador") {
      return res
        .status(403)
        .json({ message: "No se puede eliminar un administrador" });
    }

    await User.findByIdAndDelete(id);

    res.json({
      message: "Usuario eliminado correctamente",
      usuarioEliminado: id,
    });
  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

module.exports = {
  actualizarPerfil,
  crearUsuario,
  obtenerUsuarios,
  suspenderUsuario,
  eliminarUsuario,
};
