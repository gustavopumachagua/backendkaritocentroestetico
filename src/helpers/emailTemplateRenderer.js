const fs = require("fs");
const path = require("path");

const EMAILS_DIR = path.join(__dirname, "..", "emails");

/**
 * Lee una plantilla HTML desde el directorio `emails/` y reemplaza
 * las variables con la sintaxis {{variable}}.
 *
 * @param {string} templateName  — Nombre del archivo (e.g. "resetPassword.html").
 * @param {Object} variables     — Pares clave-valor a interpolar.
 * @returns {string}             — HTML con las variables reemplazadas.
 */
function renderEmailTemplate(templateName, variables = {}) {
  const templatePath = path.join(EMAILS_DIR, templateName);
  let html = fs.readFileSync(templatePath, "utf8");

  for (const key in variables) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), variables[key]);
  }

  return html;
}

module.exports = renderEmailTemplate;
