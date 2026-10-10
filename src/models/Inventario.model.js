const mongoose = require("mongoose");
const { PROFESSIONAL_ROLES } = require("../constants");

const inventarioSchema = new mongoose.Schema(
  {
    rol: {
      type: String,
      enum: PROFESSIONAL_ROLES,
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
      maxlength: 160,
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
