const mongoose = require("mongoose");
const { Schema } = mongoose;

const CitaSchema = new Schema(
  {
    cliente: { type: String, required: true },
    rol: { type: String, required: true, lowercase: true },
    profesional: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },

    servicio: [
      {
        type: String,
      },
    ],
    fecha: { type: Date, required: true },
    estado: {
      type: String,
      enum: ["pendiente", "atendido", "aplazado", "cancelado"],
      default: "pendiente",
    },
    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 100,
      unique: true,
      sparse: true,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Cita", CitaSchema);
