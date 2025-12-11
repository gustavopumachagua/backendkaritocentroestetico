const mongoose = require("mongoose");
const { Schema } = mongoose;

const TratamientoSchema = new Schema(
  {
    nombre: { type: String, required: true },
    edad: { type: Number },
    sexo: { type: String },
    servicio: [{ type: String }],
    fecha: { type: Date, required: true },
    celular: { type: String, required: true },
    observacion: { type: String },
    insumos: [{ type: String }],
    imagenes: [
      {
        url: String,
        public_id: String,
      },
    ],
    profesional: { type: String },
    rol: { type: String },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Tratamiento", TratamientoSchema);
