const brevo = require("@getbrevo/brevo");

async function sendEmail({ to, subject, html }) {
  try {
    const apiInstance = new brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(
      brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY
    );

    const match = process.env.MAIL_FROM.match(/(.*)<(.*)>/);
    const name = match ? match[1].trim() : "Centro Estético";
    const email = match ? match[2].trim() : process.env.MAIL_FROM;

    const sendSmtpEmail = {
      sender: { name, email },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    };

    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(
      "📧 Correo enviado correctamente:",
      response?.messageId || "sin ID"
    );
  } catch (error) {
    console.error("❌ Error al enviar el correo:", error);
  }
}

module.exports = sendEmail;
