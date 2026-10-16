const mongoose = require("mongoose");
const { Schema } = mongoose;

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const meal = () => ({ type: String, trim: true, default: "", maxlength: 1500 });
const daySchema = new Schema({
  dia: { type: String, required: true, enum: DAYS },
  desayuno: meal(), mediaManana: meal(), almuerzo: meal(), mediaTarde: meal(), cena: meal(),
}, { _id: false });
const indicatorSchema = new Schema({
  edad: { type: String, trim: true, default: "", maxlength: 3 },
  peso: { type: String, trim: true, default: "", maxlength: 12 },
  talla: { type: String, trim: true, default: "", maxlength: 12 },
  imc: { type: String, trim: true, default: "", maxlength: 12 },
}, { _id: false });

const planAlimentarioSchema = new Schema({
  historiaClinicaId: { type: Schema.Types.ObjectId, ref: "HistoriaClinica", required: true, unique: true, immutable: true },
  profesionalId: { type: Schema.Types.ObjectId, ref: "Usuario", required: true, index: true, immutable: true },
  estado: { type: String, enum: ["borrador", "finalizado"], default: "borrador", required: true },
  indicadores: { type: indicatorSchema, required: true },
  semana: {
    type: [daySchema], required: true,
    validate: (value) => value.length === DAYS.length && value.every((day, index) => day.dia === DAYS[index]),
  },
  indicaciones: { type: String, trim: true, default: "", maxlength: 4000 },
  revision: { type: Number, required: true, min: 1 },
  finalizadoEn: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

// The patient name is deliberately not duplicated here: the linked history
// remains authoritative when a verified patient identity is corrected.
module.exports = mongoose.model("PlanAlimentario", planAlimentarioSchema);
