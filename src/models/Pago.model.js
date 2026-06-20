const mongoose = require("mongoose");
const { Schema } = mongoose;

const PagoSchema = new Schema(
  {
    cita: { type: Schema.Types.ObjectId, ref: "Cita", required: true },
    cliente: { type: String, required: true },
    numeroBoleta: { type: Number, unique: true },
    serie: { type: String, default: "BA01" },
    servicios: [
      {
        nombre: { type: String, required: true },
        precio: { type: Number, required: true, min: 0 },
      },
    ],
    metodoPago: {
      type: String,
      enum: ["efectivo", "tarjeta", "yape/BCP", "plin/BBVA"],
      required: true,
    },
    total: { type: Number, required: true, min: 0 },
    fecha: { type: Date, required: true },
    estadoPago: {
      type: String,
      enum: ["pendiente", "pagado", "cancelado"],
      default: "pendiente",
      required: true,
    },
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("Pago", PagoSchema);
