const brevo = require("@getbrevo/brevo");

function getSender() {
  const mailFrom = process.env.MAIL_FROM;

  if (!mailFrom) {
    throw new Error("MAIL_FROM no está configurado");
  }

  const match = mailFrom.match(/(.*)<(.*)>/);

  return {
    name: match ? match[1].trim() : "Centro Estético",
    email: match ? match[2].trim() : mailFrom.trim(),
  };
}

function buildEmailError(error) {
  const status = error?.response?.status;
  const providerMessage =
    error?.response?.data?.message ||
    error?.body?.message ||
    error?.message ||
    "Error desconocido al enviar correo";

  const detailedError = new Error(
    `Brevo rechazó el envío${status ? ` (${status})` : ""}: ${providerMessage}`
  );

  detailedError.status = status || 500;
  detailedError.providerData = error?.response?.data || error?.body || null;

  return detailedError;
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY no está configurado");
  }

  const { name, email } = getSender();

  try {
    const apiInstance = new brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(
      brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY
    );

    const sendSmtpEmail = {
      sender: { name, email },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    };

    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    const messageId = response?.body?.messageId || response?.messageId || "sin ID";

    console.log(
      "📧 Correo enviado correctamente:",
      messageId
    );

    return response?.body || response;
  } catch (error) {
    const detailedError = buildEmailError(error);

    console.error("❌ Error al enviar el correo:", detailedError.message);

    if (detailedError.providerData) {
      console.error("Brevo respondió:", detailedError.providerData);
    }

    throw detailedError;
  }
}

module.exports = sendEmail;
