const test = require("node:test");
const assert = require("node:assert/strict");
const { Types } = require("mongoose");
const historiaService = require("./historiaClinica.service");
const historiaRepository = require("../repositories/historiaClinica.repository");
const tratamientoRepository = require("../repositories/tratamiento.repository");
const citaRepository = require("../repositories/cita.repository");
const userRepository = require("../repositories/user.repository");
const professionalService = require("./professionalIdentity.service");
const patientRepository = require("../repositories/patientIdentity.repository");
const { getMissingFinalizationSections } = require("../helpers/clinicalHistoryValidator");

const id = (number) => number.toString(16).padStart(24, "0");
function completedForm(nombreCompleto) {
  const date = "2026-10-09";
  const form = {
    nombreCompleto, sexo: "Femenino", dni: "12345678", fechaNacimiento: "1990-01-01",
    edad: String(new Date().getFullYear() - 1990), telefono: "987654321", ocupacion: "Profesional",
    fechaConsulta: date, medicoTratante: "Dra. Actual", motivoPrincipal: "Control", dificultadPeso: "No", objetivoPaciente: "Control",
    pesoMaximo: "80", pesoHabitual: "70", pesoActual: "70", talla: "1.65", imc: "25.7", perimetroAbdominal: "80",
    evolucionPeso: "Estable", intentosPrevios: "Ninguno", tratamientosPreviosRespuesta: "No",
    enfermedadesAntecedentes: ["Ninguna"], antecedentesFamiliares: ["Ninguno"], familiaresEspecificar: "Ninguno",
    sintomasActuales: ["Ninguno"], conductaPlan: ["Seguimiento"], diagnostico1: "Control", comorbilidades: "No",
    factoresRiesgo: "No", observacionesClinicas: "Control", examenFisico: "Normal", medicamentoIndicado: "Según evaluación",
    presentacion: "Según evaluación", dosisInicial: "Según evaluación", fechaInicioTratamiento: date, proximoControl: "2026-10-20",
    consentimientoInformado: "Sí", consentimientoFecha: date, fechaConstancia: date, fechaLaboratorio: date,
    presionSistolica: "120", presionDiastolica: "80", frecuenciaCardiaca: "70", pesoClinico: "70", tallaClinica: "1.65",
    imcClinico: "25.7", perimetroAbdominalClinico: "80",
  };
  const textFields = ["cirugiasPrevias", "hospitalizacionesPrevias", "alergiaMedicamentos", "alergiasAlimentarias", "alergiaLatex",
    "reaccionesAdversas", "transfusionesSanguineas", "fum", "g", "p", "c", "a", "metodoAnticonceptivo", "embarazoActual",
    "posibilidadEmbarazo", "lactancia", "medicamentosActuales", "suplementosVitaminas", "agonistasGlp1", "alimentacionHabitual",
    "comidasDia", "sensacionHambre", "antojosPicoteo", "actividadFisica", "horasSueno", "calidadSueno", "consumoAlcohol",
    "carcinomaMedularPersonal", "carcinomaMedularFamiliar", "men2PersonalFamiliar", "enfermedadTiroideaConocida",
    "pancreatitisPrevia", "dolorAbdominalRecurrente", "litiasisVesicular", "colecistitis", "cirugiaVesicula", "enfermedadHepatica",
    "ictericiaPrevia", "gastroparesia", "enfermedadGiImportante", "enfermedadRenal", "deshidratacionReciente", "hipoglucemiasPrevias",
    "insulina", "sulfonilureas", "otrosMedDiabetes", "otrosMedPeso", "glucosaAyunas", "hba1c", "creatinina", "tfge", "tgoAst",
    "tgpAlt", "colesterolTotal", "ldl", "hdl", "trigliceridos", "tsh"];
  for (const field of textFields) form[field] = "No";
  return form;
}

test("Guardar and Finalizar change the same client everywhere and preserve one clinical record", async (t) => {
  const targets = [historiaRepository, tratamientoRepository, citaRepository, userRepository, professionalService, patientRepository];
  const originals = targets.map((target) => ({ ...target }));
  t.after(() => targets.forEach((target, index) => Object.assign(target, originals[index])));
  const doctorId = id(10);
  const treatment = { _id: id(1), profesionalId: new Types.ObjectId(doctorId), rol: "doctor", nombre: "Camila", celular: "987654321", sexo: "Femenino" };
  const older = { _id: id(2), profesionalId: id(11), rol: "cosmiatra", nombre: "Camila", celular: "987654321", sexo: "Femenino", cita: id(3) };
  const cita = { _id: id(3), profesional: id(11), cliente: "Camila" };
  const pago = { _id: id(4), cita: id(3), cliente: "Camila" };
  const records = { tratamientos: [treatment, older], citas: [cita], pagos: [pago], historias: [] };
  let history;
  let creates = 0;
  professionalService.reconciliarIdentidadesProfesionales = async () => ({});
  userRepository.findById = async () => ({ _id: new Types.ObjectId(doctorId), rol: "doctor", nombre: "Dra. Actual", cmp: "123456" });
  tratamientoRepository.findById = async () => treatment;
  historiaRepository.findByTratamiento = async () => history || null;
  historiaRepository.findByIdAndMedico = async () => history;
  historiaRepository.findByMedicoAndClavePaciente = async () => history || null;
  historiaRepository.create = async (data) => {
    creates++;
    history = { _id: id(5), ...data, markModified() {} };
    records.historias.push(history);
    return history;
  };
  historiaRepository.save = async (record) => record;
  patientRepository.findCandidates = async () => records;
  const map = { cita: "citas", tratamiento: "tratamientos", pago: "pagos", historia: "historias" };
  patientRepository.applyMutation = async ({ type, id: recordId, next }) => {
    const record = records[map[type]].find((value) => value._id === recordId);
    for (const [path, value] of Object.entries(next)) {
      const keys = path.split(".");
      const key = keys.pop();
      keys.reduce((parent, field) => parent[field] ||= {}, record)[key] = value;
    }
    return record;
  };
  patientRepository.restoreMutation = async () => ({});
  const saved = await historiaService.guardarHistoriaClinica({ doctorId, tratamientoId: id(1),
    patientName: "Camila Pérez", patientOriginalName: "Camila", paciente: { celular: "987654321", sexo: "Femenino" },
    formData: { nombreCompleto: "Camila Pérez" }, currentStep: 0, status: "draft" });
  assert.equal(saved.historia.estado, "borrador");
  assert.equal(treatment.nombre, "Camila Pérez");
  assert.equal(older.nombre, "Camila Pérez");
  assert.equal(cita.cliente, "Camila Pérez");
  assert.equal(pago.cliente, "Camila Pérez");

  const formData = completedForm("Camila Pérez Hidalgo");
  assert.deepEqual(getMissingFinalizationSections(formData), []);
  const finished = await historiaService.guardarHistoriaClinica({ doctorId, historyId: id(5), tratamientoId: id(1),
    patientName: "Camila Pérez Hidalgo", patientOriginalName: "Camila", paciente: { celular: "987654321", sexo: "Femenino" },
    formData, currentStep: 14, status: "finalized" });
  assert.equal(creates, 1);
  assert.equal(records.historias.length, 1);
  assert.equal(finished.historia._id, id(5));
  assert.equal(finished.historia.estado, "finalizada");
  assert.equal(finished.historia.clavePaciente, `tratamiento:${id(1)}`);
  assert.equal(finished.historia.datosFormulario.nombreCompleto, "Camila Pérez Hidalgo");
  assert.equal(treatment.nombre, "Camila Pérez Hidalgo");
  assert.equal(older.nombre, "Camila Pérez Hidalgo");
  assert.equal(cita.cliente, "Camila Pérez Hidalgo");
  assert.equal(pago.cliente, "Camila Pérez Hidalgo");
  assert.equal(finished.notificacion.paciente.nombre, "Camila Pérez Hidalgo");
  assert.ok([...records.tratamientos, ...records.citas, ...records.pagos, ...records.historias].every((value) => value.pacienteId === id(1)));
});
