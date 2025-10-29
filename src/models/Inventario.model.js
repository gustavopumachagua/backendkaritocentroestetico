const mongoose = require("mongoose");

const inventarioSchema = new mongoose.Schema(
  {
    rol: {
      type: String,
      enum: ["cosmiatra", "doctor"],
      required: true,
    },
    tipo: {
      type: String,
      enum: ["insumo", "servicio"],
      required: true,
    },
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    umbral: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Inventario", inventarioSchema);
