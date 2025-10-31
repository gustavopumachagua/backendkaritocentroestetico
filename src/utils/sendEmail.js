const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, html }) {
  try {
    const response = await resend.emails.send({
      from:
        process.env.MAIL_FROM ||
        "Karito Centro Estético <onboarding@resend.dev>",
      to,
      subject,
      html,
    });

    if (response.error) {
      console.error("❌ Error al enviar el correo:", response.error);
    } else {
      console.log(
        "📧 Correo enviado correctamente:",
        response.data?.id || "sin ID"
      );
    }
  } catch (error) {
    console.error("❌ Error inesperado al enviar el correo:", error);
  }
}

module.exports = sendEmail;
