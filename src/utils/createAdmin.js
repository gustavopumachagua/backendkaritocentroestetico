require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const User = require("../models/User.model");
const connectDB = require("../config/db");
const sendEmail = require("./sendEmail");

function renderEmailTemplate(templateName, variables = {}) {
  const templatePath = path.join(__dirname, "..", "emails", templateName);
  let html = fs.readFileSync(templatePath, "utf8");

  for (const key in variables) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), variables[key]);
  }

  return html;
}

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
