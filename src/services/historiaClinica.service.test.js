const assert = require("node:assert/strict");
const test = require("node:test");

const historiaClinicaService = require("./historiaClinica.service");
const historiaRepository = require("../repositories/historiaClinica.repository");
const citaRepository = require("../repositories/cita.repository");
const tratamientoRepository = require("../repositories/tratamiento.repository");
const userRepository = require("../repositories/user.repository");
const professionalIdentityService = require("./professionalIdentity.service");
const patientIdentityRepository = require("../repositories/patientIdentity.repository");

test.beforeEach((t) => {
  const original = professionalIdentityService.reconciliarIdentidadesProfesionales;
  professionalIdentityService.reconciliarIdentidadesProfesionales = async () => ({ modified: 0 });
  t.after(() => { professionalIdentityService.reconciliarIdentidadesProfesionales = original; });
  const identityOriginals = { ...patientIdentityRepository };
  patientIdentityRepository.findCandidates = async () => ({ citas: [], tratamientos: [], historias: [], pagos: [] });
  patientIdentityRepository.applyMutation = async ({ id, next }) => ({ _id: id, ...next });
  patientIdentityRepository.restoreMutation = async () => ({ modifiedCount: 1 });
  t.after(() => Object.assign(patientIdentityRepository, identityOriginals));
});

const DOCTOR_ID = "507f1f77bcf86cd799439011";
const TREATMENT_ID = "507f1f77bcf86cd799439012";
const HISTORY_ID = "507f1f77bcf86cd799439013";
const RETURNING_TREATMENT_ID = "507f1f77bcf86cd799439014";

test("a linked appointment never overrides a different immutable treatment owner", async (t) => {
  const userOriginal = userRepository.findById;
  const treatmentOriginals = {
    findById: tratamientoRepository.findById,
    findByCita: tratamientoRepository.findByCita,
  };
  const citaOriginal = citaRepository.findById;
  t.after(() => {
    userRepository.findById = userOriginal;
    Object.assign(tratamientoRepository, treatmentOriginals);
    citaRepository.findById = citaOriginal;
  });
  userRepository.findById = async () => ({ _id: DOCTOR_ID, rol: "doctor", nombre: "Dra. Actual" });
  const conflictingTreatment = {
    _id: TREATMENT_ID,
    cita: RETURNING_TREATMENT_ID,
    profesionalId: "507f1f77bcf86cd799439099",
    profesional: "Dra. Actual",
    rol: "doctor",
    nombre: "Paciente",
  };
  tratamientoRepository.findById = async () => conflictingTreatment;
  tratamientoRepository.findByCita = async () => conflictingTreatment;
  citaRepository.findById = async () => ({ _id: RETURNING_TREATMENT_ID, profesional: DOCTOR_ID, cliente: "Paciente" });

  for (const source of [{ tratamientoId: TREATMENT_ID }, { citaId: RETURNING_TREATMENT_ID }]) {
    await assert.rejects(
      historiaClinicaService.obtenerHistoriaPorPaciente({ doctorId: DOCTOR_ID, patientName: "Paciente", ...source }),
      (error) => error.statusCode === 403,
    );
  }
});

function captureFunctions(target, names) {
  return Object.fromEntries(names.map((name) => [name, target[name]]));
}

function restoreFunctions(target, functions) {
  Object.assign(target, functions);
}

test("finalization enables the cosmiatra handoff in the same history write, never on failed validation", async (t) => {
  const captures = [
    [historiaRepository, ["findByTratamiento", "findByMedicoAndClavePaciente", "create"]],
    [tratamientoRepository, ["findById"]], [userRepository, ["findById"]],
  ].map(([target, names]) => [target, captureFunctions(target, names)]);
  t.after(() => captures.forEach(([target, originals]) => restoreFunctions(target, originals)));
  userRepository.findById = async () => ({ _id: DOCTOR_ID, rol: "doctor", nombre: "Dra. Segura" });
  tratamientoRepository.findById = async () => ({ _id: TREATMENT_ID, nombre: "Paciente", rol: "doctor", profesionalId: DOCTOR_ID });
  historiaRepository.findByTratamiento = async () => null;
  historiaRepository.findByMedicoAndClavePaciente = async () => null;
  const writes = [];
  historiaRepository.create = async (data) => { writes.push(data); return { _id: HISTORY_ID, ...data }; };
  const input = { doctorId: DOCTOR_ID, tratamientoId: TREATMENT_ID, patientName: "Paciente", currentStep: 14, status: "finalized" };
  await assert.rejects(() => historiaClinicaService.guardarHistoriaClinica({ ...input, formData: { nombreCompleto: "Paciente" } }),
    (error) => error.statusCode === 422);
  assert.equal(writes.length, 0);

  // Synthetic fixture solely for finalization contract verification, not
  // medical advice or real patient data. All sections use explicit answers.
  const form = {
    nombreCompleto: "Paciente", sexo: "Masculino", dni: "12345678", edad: "30",
    fechaNacimiento: `${new Date().getFullYear() - 30}-01-01`, telefono: "999111222",
    ocupacion: "Demostración", fechaConsulta: "2026-10-15", motivoPrincipal: "Seguimiento",
    dificultadPeso: "No", objetivoPaciente: "Demostración", evolucionPeso: "Demostración", intentosPrevios: "No",
    tratamientosPreviosRespuesta: "No", enfermedadesAntecedentes: ["No"], antecedentesFamiliares: ["No"],
    familiaresEspecificar: "No", medicamentosActuales: "No", suplementosVitaminas: "No", agonistasGlp1: "No",
    alimentacionHabitual: "Demostración", comidasDia: "3", sensacionHambre: "No", antojosPicoteo: "No",
    actividadFisica: "No", horasSueno: "8", calidadSueno: "Demostración", consumoAlcohol: "No", sintomasActuales: ["No"],
    examenFisico: "Demostración", fechaLaboratorio: "2026-10-15", examenesAuxiliares: [{ examen: "Examen de prueba", resultado: "Resultado de prueba" }],
    diagnostico1: "Demostración", comorbilidades: "No", factoresRiesgo: "No", observacionesClinicas: "Demostración",
    conductaPlan: ["Seguimiento"], medicamentoIndicado: "Demostración", presentacion: "Demostración", dosisInicial: "Demostración",
    fechaInicioTratamiento: "2026-10-15", proximoControl: "2026-11-15", consentimientoInformado: "Sí",
    consentimientoFecha: "2026-10-15", fechaConstancia: "2026-10-15",
  };
  for (const field of ["pesoMaximo", "pesoHabitual", "pesoActual", "talla", "imc", "perimetroAbdominal", "presionSistolica", "presionDiastolica", "frecuenciaCardiaca", "pesoClinico", "tallaClinica", "imcClinico", "perimetroAbdominalClinico"]) form[field] = "1";
  for (const field of ["cirugiasPrevias", "hospitalizacionesPrevias", "alergiaMedicamentos", "alergiasAlimentarias", "alergiaLatex", "reaccionesAdversas", "transfusionesSanguineas", "carcinomaMedularPersonal", "carcinomaMedularFamiliar", "men2PersonalFamiliar", "enfermedadTiroideaConocida", "pancreatitisPrevia", "dolorAbdominalRecurrente", "litiasisVesicular", "colecistitis", "cirugiaVesicula", "enfermedadHepatica", "ictericiaPrevia", "gastroparesia", "enfermedadGiImportante", "enfermedadRenal", "deshidratacionReciente", "hipoglucemiasPrevias", "insulina", "sulfonilureas", "otrosMedDiabetes", "otrosMedPeso"]) form[field] = "No";
  const result = await historiaClinicaService.guardarHistoriaClinica({ ...input, formData: form });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].estado, "finalizada");
  assert.equal(writes[0].seguimientoAlimentarioHabilitado, true);
  assert.ok(writes[0].finalizadaEn instanceof Date);
  assert.equal(result.historia.seguimientoAlimentarioHabilitado, true);
  assert.equal(result.finalizadaAhora, true);
});

test("a treatment id prevents a homonymous history from being reused on rename", async (t) => {
  const historyMethods = captureFunctions(historiaRepository, [
    "findByTratamiento",
    "findByMedicoAndClavePaciente",
    "create",
  ]);
  const treatmentMethods = captureFunctions(tratamientoRepository, [
    "findById",
    "renamePacienteById",
  ]);
  const userMethods = captureFunctions(userRepository, ["findById"]);
  const citaMethods = captureFunctions(citaRepository, ["findById"]);

  t.after(() => {
    restoreFunctions(historiaRepository, historyMethods);
    restoreFunctions(tratamientoRepository, treatmentMethods);
    restoreFunctions(userRepository, userMethods);
    restoreFunctions(citaRepository, citaMethods);
  });

  const queriedKeys = [];
  const renamedTreatments = [];
  let createdHistory = null;

  userRepository.findById = async () => ({
    _id: DOCTOR_ID,
    rol: "doctor",
    nombre: "Dra. Segura",
    cmp: "123456",
    firmaDigital: "",
  });
  tratamientoRepository.findById = async () => ({
    _id: TREATMENT_ID,
    nombre: "Ana López",
    rol: "doctor",
    profesionalId: DOCTOR_ID,
  });
  patientIdentityRepository.applyMutation = async ({ type, id, next }) => {
    if (type === "tratamiento") renamedTreatments.push({ id, nombre: next.nombre });
    return { _id: id, ...next };
  };
  citaRepository.findById = async () => null;
  historiaRepository.findByTratamiento = async () => null;
  historiaRepository.findByMedicoAndClavePaciente = async (_doctorId, key) => {
    queriedKeys.push(key);
    return null;
  };
  historiaRepository.create = async (data) => {
    createdHistory = { _id: "507f1f77bcf86cd799439013", ...data };
    return createdHistory;
  };

  await historiaClinicaService.guardarHistoriaClinica({
    doctorId: DOCTOR_ID,
    tratamientoId: TREATMENT_ID,
    patientName: "Ana López García",
    patientOriginalName: "Ana López",
    paciente: { nombre: "Ana López García" },
    formData: { nombreCompleto: "Ana López García" },
    currentStep: 0,
    status: "draft",
  });

  assert.equal(createdHistory.tratamiento, TREATMENT_ID);
  assert.equal(createdHistory.clavePaciente, `tratamiento:${TREATMENT_ID}`);
  assert.equal(createdHistory.paciente.nombre, "Ana López García");
  assert.equal(createdHistory.seguimientoAlimentarioHabilitado, false);
  assert.ok(queriedKeys.every((key) => key === `tratamiento:${TREATMENT_ID}`));
  assert.deepEqual(renamedTreatments, [
    { id: TREATMENT_ID, nombre: "Ana López García" },
  ]);
});

test("rejects a display-name correction without cita or treatment identity", async (t) => {
  const userMethods = captureFunctions(userRepository, ["findById"]);
  t.after(() => restoreFunctions(userRepository, userMethods));

  userRepository.findById = async () => ({
    _id: DOCTOR_ID,
    rol: "doctor",
    nombre: "Dra. Segura",
  });

  await assert.rejects(
    historiaClinicaService.guardarHistoriaClinica({
      doctorId: DOCTOR_ID,
      patientName: "Ana López García",
      patientOriginalName: "Ana López",
      formData: { nombreCompleto: "Ana López García" },
      currentStep: 0,
      status: "draft",
    }),
    /se requiere la cita o el tratamiento original/i,
  );
});

test("uses remote historyId to migrate an old unlinked history without a name lookup", async (t) => {
  const historyMethods = captureFunctions(historiaRepository, [
    "findByIdAndMedico",
    "findByMedicoAndClavePaciente",
    "save",
    "create",
  ]);
  const treatmentMethods = captureFunctions(tratamientoRepository, [
    "findById",
    "renamePacienteById",
  ]);
  const userMethods = captureFunctions(userRepository, ["findById"]);

  t.after(() => {
    restoreFunctions(historiaRepository, historyMethods);
    restoreFunctions(tratamientoRepository, treatmentMethods);
    restoreFunctions(userRepository, userMethods);
  });

  const legacyHistory = {
    _id: HISTORY_ID,
    medico: DOCTOR_ID,
    paciente: { nombre: "Camila Cabello", celular: "999111222" },
    clavePaciente: "camila cabello",
    markModified() {},
  };
  let created = false;

  userRepository.findById = async () => ({
    _id: DOCTOR_ID,
    rol: "doctor",
    nombre: "Dra. Segura",
  });
  tratamientoRepository.findById = async () => ({
    _id: TREATMENT_ID,
    nombre: "Camila Cabello",
    rol: "doctor",
    profesionalId: DOCTOR_ID,
  });
  tratamientoRepository.renamePacienteById = async (id, nombre) => ({
    _id: id,
    nombre,
  });
  historiaRepository.findByIdAndMedico = async (id, doctorId) =>
    id === HISTORY_ID && doctorId === DOCTOR_ID ? legacyHistory : null;
  historiaRepository.findByMedicoAndClavePaciente = async () => legacyHistory;
  historiaRepository.save = async (history) => history;
  historiaRepository.create = async () => {
    created = true;
    return null;
  };

  const result = await historiaClinicaService.guardarHistoriaClinica({
    doctorId: DOCTOR_ID,
    historyId: HISTORY_ID,
    tratamientoId: TREATMENT_ID,
    patientName: "Camila Caballo",
    patientOriginalName: "Camila Cabello",
    paciente: { nombre: "Camila Caballo" },
    formData: { nombreCompleto: "Camila Caballo" },
    currentStep: 0,
    status: "draft",
  });

  assert.equal(created, false);
  assert.equal(result.creada, false);
  assert.equal(result.historia._id, HISTORY_ID);
  assert.equal(result.historia.tratamiento, TREATMENT_ID);
  assert.equal(result.historia.clavePaciente, `tratamiento:${TREATMENT_ID}`);
  assert.equal(result.historia.paciente.nombre, "Camila Caballo");
});

test("does not attach a legacy historyId to a different patient identity", async (t) => {
  const historyMethods = captureFunctions(historiaRepository, [
    "findByIdAndMedico",
    "save",
  ]);
  const treatmentMethods = captureFunctions(tratamientoRepository, [
    "findById",
    "renamePacienteById",
  ]);
  const userMethods = captureFunctions(userRepository, ["findById"]);

  t.after(() => {
    restoreFunctions(historiaRepository, historyMethods);
    restoreFunctions(tratamientoRepository, treatmentMethods);
    restoreFunctions(userRepository, userMethods);
  });

  let renamed = false;
  let saved = false;
  userRepository.findById = async () => ({
    _id: DOCTOR_ID,
    rol: "doctor",
    nombre: "Dra. Segura",
  });
  historiaRepository.findByIdAndMedico = async () => ({
    _id: HISTORY_ID,
    medico: DOCTOR_ID,
    paciente: { nombre: "Paciente A" },
    clavePaciente: "legacy:paciente a",
    markModified() {},
  });
  historiaRepository.save = async () => {
    saved = true;
  };
  tratamientoRepository.findById = async () => ({
    _id: TREATMENT_ID,
    nombre: "Paciente B",
    rol: "doctor",
    profesionalId: DOCTOR_ID,
  });
  tratamientoRepository.renamePacienteById = async () => {
    renamed = true;
  };

  await assert.rejects(
    historiaClinicaService.guardarHistoriaClinica({
      doctorId: DOCTOR_ID,
      historyId: HISTORY_ID,
      tratamientoId: TREATMENT_ID,
      patientName: "Paciente B Corregido",
      patientOriginalName: "Paciente B",
      paciente: { nombre: "Paciente B Corregido" },
      formData: { nombreCompleto: "Paciente B Corregido" },
      currentStep: 0,
      status: "draft",
    }),
    /no coincide de forma segura/i,
  );

  assert.equal(renamed, false);
  assert.equal(saved, false);
});

test("compensates the patient rename when history persistence fails", async (t) => {
  const historyMethods = captureFunctions(historiaRepository, [
    "findByTratamiento",
    "findByMedicoAndClavePaciente",
    "create",
  ]);
  const treatmentMethods = captureFunctions(tratamientoRepository, [
    "findById",
    "renamePacienteById",
    "restorePacienteByIdIfCurrentName",
  ]);
  const userMethods = captureFunctions(userRepository, ["findById"]);

  t.after(() => {
    restoreFunctions(historiaRepository, historyMethods);
    restoreFunctions(tratamientoRepository, treatmentMethods);
    restoreFunctions(userRepository, userMethods);
  });

  const rollbackCalls = [];
  userRepository.findById = async () => ({
    _id: DOCTOR_ID,
    rol: "doctor",
    nombre: "Dra. Segura",
  });
  tratamientoRepository.findById = async () => ({
    _id: TREATMENT_ID,
    nombre: "Ana López",
    rol: "doctor",
    profesionalId: DOCTOR_ID,
  });
  tratamientoRepository.renamePacienteById = async (id, nombre) => ({
    _id: id,
    nombre,
  });
  patientIdentityRepository.restoreMutation = async ({ id, next, previous }) => {
    rollbackCalls.push({ id, currentName: next.nombre, originalName: previous.nombre });
  };
  historiaRepository.findByTratamiento = async () => null;
  historiaRepository.findByMedicoAndClavePaciente = async () => null;
  historiaRepository.create = async () => {
    throw new Error("database unavailable");
  };

  await assert.rejects(
    historiaClinicaService.guardarHistoriaClinica({
      doctorId: DOCTOR_ID,
      tratamientoId: TREATMENT_ID,
      patientName: "Ana López García",
      patientOriginalName: "Ana López",
      paciente: { nombre: "Ana López García" },
      formData: { nombreCompleto: "Ana López García" },
      currentStep: 0,
      status: "draft",
    }),
    /database unavailable/i,
  );

  assert.deepEqual(rollbackCalls, [
    {
      id: TREATMENT_ID,
      currentName: "Ana López García",
      originalName: "Ana López",
    },
  ]);
});

test("reopens the latest finalized history for the same doctor, full name and phone", async (t) => {
  const historyMethods = captureFunctions(historiaRepository, [
    "findByTratamiento",
    "findByMedicoAndClavePaciente",
    "findFinalizadasByMedico",
  ]);
  const treatmentMethods = captureFunctions(tratamientoRepository, ["findById"]);
  const userMethods = captureFunctions(userRepository, ["findById"]);

  t.after(() => {
    restoreFunctions(historiaRepository, historyMethods);
    restoreFunctions(tratamientoRepository, treatmentMethods);
    restoreFunctions(userRepository, userMethods);
  });

  const finalizedHistory = {
    _id: HISTORY_ID,
    medico: DOCTOR_ID,
    estado: "finalizada",
    paciente: {
      nombre: "Ángela  Pérez",
      celular: "999 111 222",
    },
    datosFormulario: { nombreCompleto: "Ángela Pérez" },
  };

  userRepository.findById = async () => ({
    _id: DOCTOR_ID,
    rol: "doctor",
    nombre: "Dra. Segura",
  });
  tratamientoRepository.findById = async (id) =>
    id === RETURNING_TREATMENT_ID
      ? {
          _id: RETURNING_TREATMENT_ID,
          nombre: "Angela Perez",
          celular: "999-111-222",
          rol: "doctor",
          profesionalId: DOCTOR_ID,
        }
      : null;
  historiaRepository.findByTratamiento = async () => null;
  historiaRepository.findByMedicoAndClavePaciente = async () => null;
  historiaRepository.findFinalizadasByMedico = async (doctorId) => {
    assert.equal(doctorId, DOCTOR_ID);
    return [finalizedHistory];
  };

  const result = await historiaClinicaService.obtenerHistoriaPorPaciente({
    doctorId: DOCTOR_ID,
    tratamientoId: RETURNING_TREATMENT_ID,
    patientName: "Angela Perez",
    patientPhone: "999-111-222",
  });

  assert.equal(result, finalizedHistory);
  assert.equal(result.tratamiento, undefined);
});

test("does not reuse a finalized history when the returning treatment lacks a matching phone", async (t) => {
  const historyMethods = captureFunctions(historiaRepository, [
    "findByTratamiento",
    "findByMedicoAndClavePaciente",
    "findFinalizadasByMedico",
  ]);
  const treatmentMethods = captureFunctions(tratamientoRepository, ["findById"]);
  const userMethods = captureFunctions(userRepository, ["findById"]);

  t.after(() => {
    restoreFunctions(historiaRepository, historyMethods);
    restoreFunctions(tratamientoRepository, treatmentMethods);
    restoreFunctions(userRepository, userMethods);
  });

  let finalHistoryLookupCalled = false;
  userRepository.findById = async () => ({
    _id: DOCTOR_ID,
    rol: "doctor",
    nombre: "Dra. Segura",
  });
  tratamientoRepository.findById = async () => ({
    _id: RETURNING_TREATMENT_ID,
    nombre: "Ángela Pérez",
    celular: "",
    rol: "doctor",
    profesionalId: DOCTOR_ID,
  });
  historiaRepository.findByTratamiento = async () => null;
  historiaRepository.findByMedicoAndClavePaciente = async () => null;
  historiaRepository.findFinalizadasByMedico = async () => {
    finalHistoryLookupCalled = true;
    return [];
  };

  const result = await historiaClinicaService.obtenerHistoriaPorPaciente({
    doctorId: DOCTOR_ID,
    tratamientoId: RETURNING_TREATMENT_ID,
    patientName: "Ángela Pérez",
  });

  assert.equal(result, null);
  assert.equal(finalHistoryLookupCalled, false);
});

test("synchronizes only a doctor's document metadata across their histories", async (t) => {
  const historyMethods = captureFunctions(historiaRepository, [
    "updateDoctorMetadata",
  ]);
  t.after(() => restoreFunctions(historiaRepository, historyMethods));

  const calls = [];
  historiaRepository.updateDoctorMetadata = async (...args) => {
    calls.push(args);
    return { matchedCount: 3, modifiedCount: 3 };
  };

  const result =
    await historiaClinicaService.sincronizarDatosMedicoEnHistorias({
      _id: DOCTOR_ID,
      rol: "doctor",
      nombre: "Dra. Perfil Actualizado",
      cmp: "654321",
      firmaDigital: "https://cdn.example.test/firma-nueva.webp",
    });

  assert.deepEqual(result, { matchedCount: 3, modifiedCount: 3 });
  assert.deepEqual(calls, [
    [
      DOCTOR_ID,
      {
        nombre: "Dra. Perfil Actualizado",
        cmp: "654321",
        firmaDigital: "https://cdn.example.test/firma-nueva.webp",
      },
    ],
  ]);
});

test("does not synchronize clinical histories for a non-doctor profile", async (t) => {
  const historyMethods = captureFunctions(historiaRepository, [
    "updateDoctorMetadata",
  ]);
  t.after(() => restoreFunctions(historiaRepository, historyMethods));

  let called = false;
  historiaRepository.updateDoctorMetadata = async () => {
    called = true;
  };

  const result =
    await historiaClinicaService.sincronizarDatosMedicoEnHistorias({
      _id: DOCTOR_ID,
      rol: "cosmiatra",
      nombre: "Perfil no clínico",
    });

  assert.deepEqual(result, { matchedCount: 0, modifiedCount: 0 });
  assert.equal(called, false);
});
