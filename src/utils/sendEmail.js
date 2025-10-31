const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, html }) {
  try {
    const data = await resend.emails.send({
      from:
        process.env.MAIL_FROM ||
        "Karito Centro Estético <onboarding@resend.dev>",
      to,
      subject,
      html,
    });

    console.log("📧 Correo enviado correctamente:", data.id);
  } catch (error) {
    console.error("❌ Error al enviar el correo:", error);
  }
}

module.exports = sendEmail;
