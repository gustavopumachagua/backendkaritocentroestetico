const mongoose = require("mongoose");
const mediaAssetSchema = require("./mediaAsset.schema");

const { Schema } = mongoose;

/**
 * Snapshot mínimo del paciente. No existe una entidad Paciente independiente
 * en el sistema actual, por lo que la historia se vincula a una Cita cuando
 * existe y conserva los datos que identifican al paciente en ese momento.
 */
const pacienteSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 160 },
    sexo: { type: String, default: "", trim: true, maxlength: 30 },
    celular: { type: String, default: "", trim: true, maxlength: 40 },
    dni: { type: String, default: "", trim: true, maxlength: 8 },
  },
  { _id: false },
);

/**
 * Snapshot de identificación profesional usado por la constancia. Cuando el
 * médico actualiza explícitamente su perfil, el sincronizador modifica solo
 * estos metadatos y los campos profesionales equivalentes del formulario;
 * las respuestas clínicas y los datos del paciente nunca se alteran.
 */
const firmaMedicoSchema = new Schema(
  {
    nombre: { type: String, default: "", trim: true, maxlength: 160 },
    cmp: { type: String, default: "", trim: true, maxlength: 30 },
    url: { type: String, default: "", trim: true, maxlength: 2048 },
    asset: { type: mediaAssetSchema, default: null },
  },
  { _id: false },
);

const historiaClinicaSchema = new Schema(
  {
    pacienteId: { type: Schema.Types.ObjectId, index: true },
    pacienteNombresAnteriores: [{ type: String, trim: true, maxlength: 160 }],
    cita: {
      type: Schema.Types.ObjectId,
      ref: "Cita",
      unique: true,
      sparse: true,
    },
    // Legacy histories can originate from a treatment with no appointment.
    // Persist that durable relation instead of relying on the patient name.
    tratamiento: {
      type: Schema.Types.ObjectId,
      ref: "Tratamiento",
      unique: true,
      sparse: true,
    },
    medico: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },
    paciente: { type: pacienteSchema, required: true },
    // `cita:<id>` or `tratamiento:<id>` for current records. Name-based keys
    // remain only for historical documents that lack a durable source id.
    clavePaciente: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    datosFormulario: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    pasoActual: { type: Number, default: 0, min: 0, max: 14 },
    estado: {
      type: String,
      enum: ["borrador", "finalizada"],
      default: "borrador",
      index: true,
    },
    proximoControl: { type: Date, default: null, index: true },
    firmaMedico: { type: firmaMedicoSchema, default: () => ({}) },
    finalizadaEn: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// Una misma doctora no puede tener dos historias activas para el mismo
// paciente cuando se trata de información histórica sin una cita enlazada.
historiaClinicaSchema.index({ medico: 1, clavePaciente: 1 }, { unique: true });
historiaClinicaSchema.index({ estado: 1, proximoControl: 1 });

module.exports = mongoose.model("HistoriaClinica", historiaClinicaSchema);
