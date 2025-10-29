const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const uploadRoutes = require("./routes/upload.routes");
const citaRoutes = require("./routes/cita.routes");
const tratamientoRoutes = require("./routes/tratamiento.routes");
const inventarioRoutes = require("./routes/inventario.routes");
const userRoutes = require("./routes/user.routes");
const pagoRoutes = require("./routes/pago.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/citas", citaRoutes);
app.use("/api/inventario", inventarioRoutes);
app.use("/api/usuarios", userRoutes);
app.use("/api/tratamientos", tratamientoRoutes);
app.use("/api/pagos", pagoRoutes);

module.exports = app;
