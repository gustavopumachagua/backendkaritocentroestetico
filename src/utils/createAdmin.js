require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User.model");
const connectDB = require("../config/db");
const renderEmailTemplate = require("../helpers/emailTemplateRenderer");
const sendEmail = require("./sendEmail");

/**
 * Asegura que exista un usuario administrador en la base de datos.
 * Se ejecuta al iniciar el servidor y puede ejecutarse como script standalone.
 */
async function ensureAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  if (!adminEmail || !adminPassword) {
    console.warn(
      "⚠️ ADMIN_EMAIL o ADMIN_PASSWORD no están configurados. Se omitió la creación del administrador."
    );
    return null;
  }

  const existingAdmin = await User.findOne({ email: adminEmail });

  if (existingAdmin) {
    console.log("⚠️ El administrador configurado ya existe:", existingAdmin.email);
    return existingAdmin;
  }

  const admin = new User({
    nombre: "Admin Principal",
    email: adminEmail,
    password: adminPassword,
    rol: "administrador",
    avatar: process.env.DEFAULT_AVATAR_URL,
  });

  await admin.save();
  console.log("✅ Administrador creado:", admin.email);

  const html = renderEmailTemplate("adminWelcomeEmail.html", {
    nombre: admin.nombre,
    email: admin.email,
    password: adminPassword,
    loginLink: `${process.env.FRONTEND_URL}/login`,
  });

  try {
    await sendEmail({
      to: admin.email,
      subject: "Bienvenido al sistema - Cuenta de Administrador",
      html,
    });

    console.log("📧 Correo de bienvenida enviado a:", admin.email);
  } catch (error) {
    console.error(
      "⚠️ El administrador se creó, pero no se pudo enviar el correo:",
      error.message
    );
  }

  return admin;
}

if (require.main === module) {
  (async () => {
    try {
      await connectDB();
      await ensureAdminUser();
      await mongoose.connection.close();
    } catch (error) {
      console.error("❌ Error al inicializar el administrador:", error);
      process.exit(1);
    }
  })();
}

module.exports = ensureAdminUser;
