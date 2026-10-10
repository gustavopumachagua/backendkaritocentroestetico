const mongoose = require("mongoose");
const { Schema } = mongoose;
const { PROFESSIONAL_ROLES } = require("../constants");

const TratamientoSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 160 },
    pacienteId: { type: Schema.Types.ObjectId, index: true },
    pacienteDni: { type: String, trim: true, maxlength: 8, default: "" },
    pacienteNombresAnteriores: [{ type: String, trim: true, maxlength: 160 }],
    sexo: { type: String, trim: true, maxlength: 30 },
    servicio: [{ type: String, trim: true, maxlength: 160 }],
    fecha: { type: Date, required: true },
    celular: { type: String, required: true, trim: true, maxlength: 40 },
    observacion: { type: String, trim: true, maxlength: 10_000 },
    insumos: [{ type: String, trim: true, maxlength: 160 }],
    imagenes: [
      {
        url: String,
        thumbnailUrl: String,
        public_id: String,
      },
    ],
    // The display name is retained for existing screens, but authorization
    // and ownership of new records use this immutable account reference.
    profesionalId: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      index: true,
    },
    profesional: { type: String, trim: true, maxlength: 160 },
    rol: { type: String, enum: PROFESSIONAL_ROLES },
    cita: {
      type: Schema.Types.ObjectId,
      ref: "Cita",
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true, versionKey: false },
);

TratamientoSchema.index({ profesionalId: 1, rol: 1 });

module.exports = mongoose.model("Tratamiento", TratamientoSchema);
