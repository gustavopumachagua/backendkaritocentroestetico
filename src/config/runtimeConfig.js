function getMissingRequiredVariables(names) {
  return names.filter((name) => !String(process.env[name] || "").trim());
}

function assertProductionHttpsUrl(value, name) {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== "https:" || !url.hostname) throw new Error();
  } catch {
    throw new Error(`${name} debe ser una URL HTTPS válida en producción`);
  }
}

/**
 * Fails closed for production-only settings that otherwise leave a deployed
 * API unable to authenticate safely or able to send reset links to nowhere.
 * Development remains convenient through the explicit local defaults.
 */
function assertRuntimeConfiguration() {
  if (process.env.NODE_ENV !== "production") return;

  const missing = getMissingRequiredVariables([
    "MONGO_URI",
    "JWT_SECRET",
    "FRONTEND_URL",
  ]);

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables obligatorias de producción: ${missing.join(", ")}`,
    );
  }

  if (process.env.JWT_SECRET.trim().length < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 caracteres en producción");
  }

  assertProductionHttpsUrl(process.env.FRONTEND_URL, "FRONTEND_URL");
  for (const origin of String(process.env.CORS_ORIGINS || "").split(",")) {
    if (origin.trim()) assertProductionHttpsUrl(origin, "CORS_ORIGINS");
  }

  if (
    process.env.ADMIN_PASSWORD &&
    process.env.ADMIN_PASSWORD.trim().length < 12
  ) {
    throw new Error("ADMIN_PASSWORD debe tener al menos 12 caracteres en producción");
  }
}

module.exports = {
  assertRuntimeConfiguration,
  getMissingRequiredVariables,
  assertProductionHttpsUrl,
};
