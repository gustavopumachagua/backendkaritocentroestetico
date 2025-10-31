require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const User = require("../models/User.model");
const sendEmail = require("../utils/sendEmail");

function renderEmailTemplate(templateName, variables = {}) {
  const templatePath = path.join(__dirname, "..", "emails", templateName);
  let html = fs.readFileSync(templatePath, "utf8");

  for (const key in variables) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), variables[key]);
  }

  return html;
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    const existeAdmin = await User.findOne({ rol: "administrador" });

    if (!existeAdmin) {
      const admin = new User({
        nombre: "Admin Principal",
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
        rol: "administrador",
        avatar: process.env.DEFAULT_AVATAR_URL,
      });

      await admin.save();
      console.log("✅ Administrador creado con avatar");

      const html = renderEmailTemplate("adminWelcomeEmail.html", {
        nombre: admin.nombre,
        email: admin.email,
        loginLink: `${process.env.FRONTEND_URL}/login`,
      });

      await sendEmail({
        to: admin.email,
        subject: "Bienvenido al sistema - Cuenta de Administrador",
        html,
      });

      console.log("📧 Correo de bienvenida enviado a:", admin.email);
    } else {
      console.log("⚠️ Ya existe un administrador");
    }

    mongoose.connection.close();
  })
  .catch((err) => console.error(err));
