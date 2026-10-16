const HistoriaClinica = require("../models/HistoriaClinica.model");
const PlanAlimentario = require("../models/PlanAlimentario.model");

// Never load the medical form, physician, signature, diagnoses or labs into
// this role's read model. Projection is the first privacy boundary.
const FOLLOW_UP_FIELDS = [
  "pacienteId", "paciente.nombre", "paciente.sexo", "paciente.celular", "finalizadaEn",
  "estado", "seguimientoAlimentarioHabilitado", "datosFormulario.edad",
  "datosFormulario.pesoClinico", "datosFormulario.pesoActual",
  "datosFormulario.tallaClinica", "datosFormulario.talla",
  "datosFormulario.imcClinico", "datosFormulario.imc",
].join(" ");
const eligible = { estado: "finalizada", seguimientoAlimentarioHabilitado: true };

const listFollowUps = () => HistoriaClinica.find(eligible)
  .select(FOLLOW_UP_FIELDS).sort({ finalizadaEn: -1, _id: -1 }).lean();
const findFollowUp = (historiaId) => HistoriaClinica.findOne({ _id: historiaId, ...eligible })
  .select(FOLLOW_UP_FIELDS).lean();
const findByHistory = (historiaId) => PlanAlimentario.findOne({ historiaClinicaId: historiaId }).lean();
const findByHistoryIds = (historiaIds) => PlanAlimentario.find({ historiaClinicaId: { $in: historiaIds } })
  .select("historiaClinicaId profesionalId estado").lean();
const create = async (data) => (await new PlanAlimentario(data).save()).toObject();
const updateDraft = ({ historiaId, profesionalId, revision, data }) => PlanAlimentario.findOneAndUpdate(
  { historiaClinicaId: historiaId, profesionalId, revision, estado: "borrador" },
  { $set: data, $inc: { revision: 1 } },
  { new: true, runValidators: true },
).lean();

module.exports = { FOLLOW_UP_FIELDS, listFollowUps, findFollowUp, findByHistory, findByHistoryIds, create, updateDraft };
