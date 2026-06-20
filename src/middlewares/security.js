const helmet = require("helmet");

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function normalizeOrigin(origin) {
  return origin?.trim().replace(/\/+$/, "");
}

function getAllowedOrigins() {
  const envOrigins = [
    process.env.FRONTEND_URL,
    ...(process.env.CORS_ORIGINS || "").split(","),
  ]
    .map(normalizeOrigin)
    .filter(Boolean);

  return [...new Set([...envOrigins, ...DEFAULT_ALLOWED_ORIGINS])];
}

function corsOptions() {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) {
        return callback(null, true);
      }

      return callback(new Error("Origen no permitido por CORS"));
    },
    credentials: true,
  };
}

function hasUnsafeMongoKey(value) {
  if (!value || typeof value !== "object") return false;

  if (Array.isArray(value)) {
    return value.some(hasUnsafeMongoKey);
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    return (
      key.startsWith("$") ||
      key.includes(".") ||
      hasUnsafeMongoKey(nestedValue)
    );
  });
}

function rejectUnsafeMongoInput(req, res, next) {
  if (hasUnsafeMongoKey(req.body) || hasUnsafeMongoKey(req.query)) {
    return res.status(400).json({ message: "Solicitud inválida" });
  }

  return next();
}

function securityHeaders() {
  return helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
}

function errorHandler(err, req, res, next) {
  if (!err) return next();

  if (err.message === "Origen no permitido por CORS") {
    return res.status(403).json({ message: "Origen no permitido" });
  }

  if (err.name === "MulterError") {
    const messages = {
      LIMIT_FILE_SIZE: "Cada imagen no debe superar el tamaño permitido",
      LIMIT_FILE_COUNT: "Solo se permiten hasta 5 imágenes",
      LIMIT_UNEXPECTED_FILE: "Archivo no permitido",
    };

    return res
      .status(400)
      .json({ message: messages[err.code] || "Archivo inválido" });
  }

  if (err.message?.includes("Solo se permiten imágenes")) {
    return res.status(400).json({ message: err.message });
  }

  console.error("Error no controlado:", err);
  return res.status(500).json({ message: "Error en el servidor" });
}

module.exports = {
  corsOptions,
  errorHandler,
  getAllowedOrigins,
  rejectUnsafeMongoInput,
  securityHeaders,
};
