const helmet = require("helmet");

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
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

  // En desarrollo mantenemos las URLs locales para no complicar el arranque.
  // En producción la lista debe ser explícita: FRONTEND_URL es obligatoria
  // (validada al iniciar) y CORS_ORIGINS permite añadir dominios concretos.
  const localOrigins =
    process.env.NODE_ENV === "production" ? [] : DEFAULT_ALLOWED_ORIGINS;

  return [...new Set([...envOrigins, ...localOrigins])];
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

function preventSensitiveCaching(req, res, next) {
  res.set("Cache-Control", "no-store, max-age=0");
  res.set("Pragma", "no-cache");
  return next();
}

function errorHandler(err, req, res, next) {
  if (!err) return next();

  // Errores operacionales lanzados desde Services/Repositories (AppError)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  if (err.message === "Origen no permitido por CORS") {
    return res.status(403).json({ message: "Origen no permitido" });
  }

  if (err.name === "MulterError") {
    const messages = {
      LIMIT_FILE_SIZE: "Cada imagen no debe superar el tamaño permitido",
      LIMIT_FILE_COUNT: "Solo se permiten hasta 5 imágenes",
      LIMIT_UNEXPECTED_FILE: "Archivo no permitido",
      LIMIT_PART_COUNT: "La carga contiene demasiados campos",
      LIMIT_FIELD_COUNT: "La carga contiene demasiados campos",
      LIMIT_FIELD_KEY: "El nombre de un campo es demasiado largo",
      LIMIT_FIELD_VALUE: "El contenido de un campo es demasiado largo",
    };

    return res
      .status(400)
      .json({ message: messages[err.code] || "Archivo inválido" });
  }

  if (
    err.message?.includes("Solo se permiten imágenes") ||
    err.message?.includes("contenido del archivo")
  ) {
    return res.status(400).json({ message: err.message });
  }

  console.error("Error no controlado:", err);
  return res.status(500).json({ message: "Error en el servidor" });
}

module.exports = {
  corsOptions,
  errorHandler,
  getAllowedOrigins,
  preventSensitiveCaching,
  rejectUnsafeMongoInput,
  securityHeaders,
};
