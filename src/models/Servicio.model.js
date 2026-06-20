const mongoose = require("mongoose");

const servicioSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  rol: { type: String, enum: ["doctor", "cosmiatra", "fuel"], required: true },
});

module.exports = mongoose.model("Servicio", servicioSchema);
