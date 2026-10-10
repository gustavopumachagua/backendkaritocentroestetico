const mongoose = require("mongoose");
const { Schema } = mongoose;
const { PROFESSIONAL_ROLES } = require("../constants");

const CitaSchema = new Schema(
  {
    cliente: { type: String, required: true, trim: true, maxlength: 160 },
    // Shared immutable patient identity; names remain editable display fields.
    pacienteId: { type: Schema.Types.ObjectId, index: true },
    rol: {
      type: String,
      required: true,
      lowercase: true,
      enum: PROFESSIONAL_ROLES,
    },
    profesional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
    },

    servicio: [
      {
        type: String,
        trim: true,
        maxlength: 160,
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
