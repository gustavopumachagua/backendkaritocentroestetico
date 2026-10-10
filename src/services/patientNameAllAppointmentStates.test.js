const test = require("node:test");
const assert = require("node:assert/strict");
const historiaService = require("./historiaClinica.service");
const citaService = require("./cita.service");
const historiaRepository = require("../repositories/historiaClinica.repository");
const tratamientoRepository = require("../repositories/tratamiento.repository");
const citaRepository = require("../repositories/cita.repository");
const userRepository = require("../repositories/user.repository");
const professionalService = require("./professionalIdentity.service");
const patientRepository = require("../repositories/patientIdentity.repository");
const { getMissingFinalizationSections } = require("../helpers/clinicalHistoryValidator");

const id = (number) => number.toString(16).padStart(24, "0");
const states = ["pendiente", "atendido", "cancelado", "aplazado"];
const roles = ["doctor", "cosmiatra"];
const doctorId = id(10);
const patientId = id(50);
const originalName = "Camila";

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

function withoutPatientName(record) {
  const { cliente, pacienteId, ...unchanged } = record;
  return unchanged;
}

function mockClinicalRecords(t) {
  const appointments = roles.flatMap((rol, roleIndex) => states.map((estado, stateIndex) => {
    const index = roleIndex * states.length + stateIndex;
    return {
      _id: id(100 + index), pacienteId: patientId, cliente: originalName,
      profesional: id(10 + roleIndex), rol, estado,
      fecha: new Date(`2026-10-${String(10 + index).padStart(2, "0")}T15:00:00.000Z`),
      servicio: rol === "doctor" ? ["Consulta", "Control"] : ["Limpieza facial"],
    };
  }));
  const payments = appointments.map((cita, index) => ({
    _id: id(300 + index), cita: cita._id, cliente: originalName,
    ...(index % 2 ? { pacienteId: patientId } : {}),
    monto: 100 + index, metodoPago: "Efectivo", fecha: cita.fecha,
  }));
  const treatments = [appointments[1], appointments[5]].map((cita, index) => ({
    _id: id(1 + index), pacienteId: patientId, nombre: originalName,
    profesionalId: cita.profesional, rol: cita.rol, cita: cita._id,
    celular: "987654321", sexo: "Femenino", pacienteDni: "12345678",
    fecha: cita.fecha, servicio: cita.servicio,
  }));
  const history = {
    _id: id(5), pacienteId: patientId, medico: doctorId,
    cita: appointments[1]._id, tratamiento: treatments[0]._id,
    clavePaciente: `cita:${appointments[1]._id}`, estado: "borrador",
    paciente: { nombre: originalName, celular: "987654321", sexo: "Femenino", dni: "12345678" },
    datosFormulario: { nombreCompleto: originalName }, markModified() {},
  };
  const homonymPatientId = id(60);
  const homonymAppointment = {
    ...appointments[0], _id: id(200), pacienteId: homonymPatientId,
  };
  const homonyms = {
    citas: [homonymAppointment],
    tratamientos: [{ ...treatments[0], _id: id(201), pacienteId: homonymPatientId, cita: homonymAppointment._id }],
    pagos: [{ ...payments[0], _id: id(202), pacienteId: homonymPatientId, cita: homonymAppointment._id }],
    historias: [{
      _id: id(203), pacienteId: homonymPatientId, medico: doctorId,
      cita: homonymAppointment._id, tratamiento: id(201),
      paciente: { ...history.paciente }, datosFormulario: { nombreCompleto: originalName },
    }],
  };
  // Display text alone cannot establish identity for unlinked legacy visits.
  const unverifiedAppointments = roles.flatMap((rol, roleIndex) => ["cancelado", "aplazado"].map((estado, stateIndex) => ({
    _id: id(400 + roleIndex * 2 + stateIndex), cliente: originalName,
    profesional: id(10 + roleIndex), rol, estado,
    fecha: new Date("2026-09-01T15:00:00.000Z"), servicio: ["Servicio histórico"],
  })));
  const unverifiedPayments = unverifiedAppointments.map((cita, index) => ({
    _id: id(500 + index), cita: cita._id, cliente: originalName, monto: 50,
  }));
  const records = {
    citas: [...appointments, ...homonyms.citas, ...unverifiedAppointments],
    tratamientos: [...treatments, ...homonyms.tratamientos],
    pagos: [...payments, ...homonyms.pagos, ...unverifiedPayments],
    historias: [history, ...homonyms.historias],
  };
  const excluded = [...Object.values(homonyms).flat(), ...unverifiedAppointments, ...unverifiedPayments];
  const excludedBefore = structuredClone(excluded);
  const appointmentsBefore = structuredClone(appointments.map(withoutPatientName));
  const paymentsBefore = structuredClone(payments.map(withoutPatientName));
  const collectionIdsBefore = Object.fromEntries(Object.entries(records).map(([key, values]) => [key, values.map((record) => record._id)]));
  const mutations = [];
  const saves = [];
  const map = { cita: "citas", tratamiento: "tratamientos", pago: "pagos", historia: "historias" };

  t.mock.method(professionalService, "reconciliarIdentidadesProfesionales", async () => ({}));
  t.mock.method(userRepository, "findById", async () => ({ _id: doctorId, rol: "doctor", nombre: "Dra. Actual", cmp: "123456" }));
  t.mock.method(tratamientoRepository, "findById", async () => treatments[0]);
  t.mock.method(citaRepository, "findById", async () => appointments[1]);
  t.mock.method(historiaRepository, "findByIdAndMedico", async () => history);
  t.mock.method(historiaRepository, "findByMedicoAndClavePaciente", async () => history);
  t.mock.method(historiaRepository, "save", async (record) => {
    saves.push(record._id);
    return record;
  });
  for (const repository of [historiaRepository, tratamientoRepository, citaRepository, userRepository]) {
    t.mock.method(repository, "create", async () => assert.fail("A name correction must reuse the existing patient records"));
  }
  t.mock.method(patientRepository, "findCandidates", async (query) => {
    assert.equal(query.pacienteId, patientId);
    return records;
  });
  t.mock.method(patientRepository, "applyMutation", async (operation) => {
    const record = records[map[operation.type]].find((value) => value._id === operation.id);
    assert.ok(record, "Every mutation updates an existing record");
    assert.ok(!excluded.includes(record), "Unverified visits and stable homonyms must not be mutated");
    mutations.push(operation);
    for (const [path, value] of Object.entries(operation.next)) {
      const keys = path.split(".");
      const key = keys.pop();
      keys.reduce((parent, field) => parent[field] ||= {}, record)[key] = value;
    }
    return record;
  });
  t.mock.method(patientRepository, "restoreMutation", async () => assert.fail("Successful corrections must not roll back"));

  return {
    appointments, payments, treatments, history, records, mutations, saves,
    assertCorrection(nombre, operations) {
      for (const record of appointments) {
        assert.equal(record.cliente, nombre, `${record.rol}/${record.estado} appointment`);
        assert.equal(record.pacienteId, patientId);
      }
      for (const record of payments) {
        assert.equal(record.cliente, nombre, `Payment for appointment ${record.cita}`);
        assert.equal(record.pacienteId, patientId);
      }
      for (const record of treatments) {
        assert.equal(record.nombre, nombre);
        assert.equal(record.pacienteId, patientId);
      }
      assert.equal(history.paciente.nombre, nombre);
      assert.equal(history.datosFormulario.nombreCompleto, nombre);
      assert.equal(history.pacienteId, patientId);
      assert.deepEqual(appointments.map(withoutPatientName), appointmentsBefore);
      assert.deepEqual(payments.map(withoutPatientName), paymentsBefore);
      assert.deepEqual(excluded, excludedBefore);
      assert.deepEqual(Object.fromEntries(Object.entries(records).map(([key, values]) => [key, values.map((record) => record._id)])), collectionIdsBefore);
      const expected = { cita: appointments, pago: payments, tratamiento: treatments, historia: [history] };
      for (const [type, documents] of Object.entries(expected)) {
        const changedIds = operations.filter((operation) => operation.type === type).map((operation) => operation.id);
        assert.deepEqual(changedIds.sort(), documents.map((record) => record._id).sort(), `Each ${type} must be renamed exactly once`);
      }
    },
  };
}

test("Guardar and Finalizar rename the existing verified patient in every appointment state across both professional roles", async (t) => {
  const fixture = mockClinicalRecords(t);
  const input = {
    doctorId, historyId: fixture.history._id, tratamientoId: fixture.treatments[0]._id,
    patientOriginalName: originalName, paciente: { celular: "987654321", sexo: "Femenino" },
  };
  const saved = await historiaService.guardarHistoriaClinica({
    ...input, patientName: "Camila Pérez", formData: { nombreCompleto: "Camila Pérez" },
    currentStep: 0, status: "draft",
  });
  assert.equal(saved.creada, false);
  assert.equal(saved.historia, fixture.history);
  assert.equal(saved.historia.estado, "borrador");
  assert.equal(saved.pacienteActualizado.excludedAppointmentsCount, 5);
  assert.deepEqual(fixture.saves, [id(5)]);
  fixture.assertCorrection("Camila Pérez", fixture.mutations);

  const firstMutationCount = fixture.mutations.length;
  const formData = completedForm("Camila Pérez Hidalgo");
  assert.deepEqual(getMissingFinalizationSections(formData), []);
  const finalized = await historiaService.guardarHistoriaClinica({
    ...input, patientName: "Camila Pérez Hidalgo", formData, currentStep: 14, status: "finalized",
  });
  assert.equal(finalized.creada, false);
  assert.equal(finalized.finalizadaAhora, true);
  assert.equal(finalized.historia, fixture.history);
  assert.equal(finalized.historia.estado, "finalizada");
  assert.equal(finalized.historia.clavePaciente, `cita:${fixture.appointments[1]._id}`);
  assert.equal(finalized.historia.cita, fixture.appointments[1]._id);
  assert.equal(finalized.historia.tratamiento, fixture.treatments[0]._id);
  assert.equal(finalized.notificacion.paciente.nombre, "Camila Pérez Hidalgo");
  assert.equal(finalized.pacienteActualizado.pacienteId, patientId);
  assert.equal(finalized.pacienteActualizado.excludedAppointmentsCount, 5);
  assert.deepEqual(fixture.saves, [id(5), id(5)]);
  fixture.assertCorrection("Camila Pérez Hidalgo", fixture.mutations.slice(firstMutationCount));
});

test("appointment state transitions preserve the stable patient identity for both professional roles", async (t) => {
  const appointments = roles.flatMap((rol, roleIndex) => states.slice(1).map((estado, stateIndex) => ({
    targetState: estado,
    record: {
      _id: id(600 + roleIndex * 3 + stateIndex), pacienteId: patientId,
      cliente: "Camila Pérez", profesional: id(10 + roleIndex), rol, estado: "pendiente",
      fecha: new Date("2026-10-20T15:00:00.000Z"), servicio: ["Servicio histórico"],
    },
  })));
  const saves = [];
  t.mock.method(citaRepository, "findById", async (recordId) => appointments.find(({ record }) => record._id === recordId).record);
  t.mock.method(citaRepository, "findByIdPopulated", async (recordId) => appointments.find(({ record }) => record._id === recordId).record);
  t.mock.method(citaRepository, "save", async (record) => {
    saves.push(record._id);
    return record;
  });
  for (const { record, targetState } of appointments) {
    const before = structuredClone(record);
    const updated = await citaService.actualizarEstadoCita(record._id, targetState, { id: record.profesional, rol: record.rol });
    assert.equal(updated, record);
    assert.deepEqual(record, { ...before, estado: targetState }, `${record.rol}/${targetState} must preserve the original patient and booking`);
  }
  assert.deepEqual(saves, appointments.map(({ record }) => record._id));
});
