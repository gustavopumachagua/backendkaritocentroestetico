const express = require("express");
const cors = require("cors");
const {
  corsOptions,
  errorHandler,
  rejectUnsafeMongoInput,
  securityHeaders,
} = require("./middlewares/security");

const authRoutes = require("./routes/auth.routes");
const uploadRoutes = require("./routes/upload.routes");
const citaRoutes = require("./routes/cita.routes");
const tratamientoRoutes = require("./routes/tratamiento.routes");
const inventarioRoutes = require("./routes/inventario.routes");
const userRoutes = require("./routes/user.routes");
const pagoRoutes = require("./routes/pago.routes");

const app = express();

app.set("query parser", "simple");

app.use(securityHeaders());
app.use(cors(corsOptions()));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(rejectUnsafeMongoInput);

app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/citas", citaRoutes);
app.use("/api/inventario", inventarioRoutes);
app.use("/api/usuarios", userRoutes);
app.use("/api/tratamientos", tratamientoRoutes);
app.use("/api/pagos", pagoRoutes);

app.use(errorHandler);

module.exports = app;
