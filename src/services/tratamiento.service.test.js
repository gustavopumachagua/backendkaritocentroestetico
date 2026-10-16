const assert = require("node:assert/strict");
const test = require("node:test");

const tratamientoService = require("./tratamiento.service");
const citaRepository = require("../repositories/cita.repository");
const tratamientoRepository = require("../repositories/tratamiento.repository");
const professionalIdentityService = require("./professionalIdentity.service");
const patientIdentityService = require("./patientIdentity.service");
const patientDemographicsService = require("./patientDemographics.service");
const { Types } = require("mongoose");

test.beforeEach((t) => {
  const original = professionalIdentityService.reconciliarIdentidadesProfesionales;
  professionalIdentityService.reconciliarIdentidadesProfesionales = async () => ({ modified: 0 });
  t.after(() => { professionalIdentityService.reconciliarIdentidadesProfesionales = original; });
});

function restore(target, originals) {
  Object.assign(target, originals);
}

test("includes legacy treatments linked to the professional's own appointments", async (t) => {
  const citaOriginals = { findByProfesional: citaRepository.findByProfesional };
  const tratamientoOriginals = {
    findByOwnerOrCitas: tratamientoRepository.findByOwnerOrCitas,
  };
  t.after(() => {
    restore(citaRepository, citaOriginals);
    restore(tratamientoRepository, tratamientoOriginals);
  });

  const received = [];
  citaRepository.findByProfesional = async (professionalId) => {
    assert.equal(professionalId, "cosmiatra-1");
    return [{ _id: "cita-legacy-1" }, { _id: "cita-legacy-2" }];
  };
  tratamientoRepository.findByOwnerOrCitas = async (...args) => {
    received.push(args);
    return [{ _id: "tratamiento-1" }];
  };

  const result = await tratamientoService.obtenerTratamientos({
    id: "cosmiatra-1",
    nombre: "Karito",
    rol: "cosmiatra",
  });

  assert.deepEqual(result, [
    {
      _id: "tratamiento-1",
      profesional: "Karito",
      profesionalId: "cosmiatra-1",
      rol: "cosmiatra",
    },
  ]);
  assert.deepEqual(received, [
    ["cosmiatra-1", "Karito", "cosmiatra", ["cita-legacy-1", "cita-legacy-2"]],
  ]);
});

test("does not broaden the administrator flow through appointment ownership", async (t) => {
  const citaOriginals = { findByProfesional: citaRepository.findByProfesional };
  const tratamientoOriginals = {
    findAll: tratamientoRepository.findAll,
    findByOwnerOrCitas: tratamientoRepository.findByOwnerOrCitas,
  };
  t.after(() => {
    restore(citaRepository, citaOriginals);
    restore(tratamientoRepository, tratamientoOriginals);
  });

  let queriedAppointments = false;
  let ownerLookup = false;
  citaRepository.findByProfesional = async () => {
    queriedAppointments = true;
    return [];
  };
  tratamientoRepository.findByOwnerOrCitas = async () => {
    ownerLookup = true;
    return [];
  };
  tratamientoRepository.findAll = async () => [{ _id: "tratamiento-total" }];

  const result = await tratamientoService.obtenerTratamientos({
    id: "admin-1",
    nombre: "Administración",
    rol: "administrador",
  });

  assert.deepEqual(result, [{ _id: "tratamiento-total" }]);
  assert.equal(queriedAppointments, false);
  assert.equal(ownerLookup, false);
});

test("allows cosmiatra to obtain the shared daily services report", async (t) => {
  const originalAppointments = citaRepository.findAttendedForHistory;
  citaRepository.findAttendedForHistory = async () => [];
  t.after(() => { citaRepository.findAttendedForHistory = originalAppointments; });
  const tratamientoOriginals = {
    findForServiceReport: tratamientoRepository.findForServiceReport,
  };
  t.after(() => restore(tratamientoRepository, tratamientoOriginals));

  const expectedTreatments = [
    { _id: "tratamiento-cosmiatra", rol: "cosmiatra" },
    { _id: "tratamiento-doctor", rol: "doctor" },
  ];
  tratamientoRepository.findForServiceReport = async () => expectedTreatments;

  const result =
    await tratamientoService.obtenerTratamientosParaReporteServicios({
      id: "cosmiatra-1",
      rol: "cosmiatra",
    });

  assert.deepEqual(result, expectedTreatments);
});

const attentionPatientId = "507f1f77bcf86cd799439031";
const attentionProfessionalId = "507f1f77bcf86cd799439032";
function attendedFixture(role = "cosmiatra") {
  return {
    _id: "507f1f77bcf86cd799439033",
    cliente: "Paciente Actual",
    pacienteId: attentionPatientId,
    profesional: { _id: attentionProfessionalId, nombre: "Profesional Actual", rol: role },
    rol: role, fecha: new Date("2026-05-01T23:45:00Z"),
    servicio: ["Mascarilla facial personalizada"], estado: "atendido",
  };
}

for (const role of ["cosmiatra", "doctor"]) {
  test(`operational history includes attended cita-only rows for the authenticated ${role}`, async (t) => {
    const citaOriginals = { ...citaRepository };
    const treatmentOriginals = { ...tratamientoRepository };
    t.after(() => {
      restore(citaRepository, citaOriginals);
      restore(tratamientoRepository, treatmentOriginals);
    });
    citaRepository.findByProfesional = async (professionalId) => {
      assert.equal(professionalId, attentionProfessionalId);
      return [attendedFixture(role)];
    };
    citaRepository.findAttendedForHistory = async (options) => {
      assert.deepEqual(options, { professionalId: attentionProfessionalId });
      return [attendedFixture(role)];
    };
    tratamientoRepository.findByOwnerOrCitas = async (professionalId, name, actualRole, citaIds) => {
      assert.equal(professionalId, attentionProfessionalId);
      assert.equal(actualRole, role);
      assert.deepEqual(citaIds, [attendedFixture(role)._id]);
      return [];
    };
    const actor = { id: attentionProfessionalId, nombre: "Profesional Actual", rol: role };
    const operational = await tratamientoService.obtenerHistorialAtenciones(actor);
    assert.equal(operational.length, 1);
    assert.equal(operational[0].citaId, attendedFixture(role)._id);
    assert.equal(operational[0].registroTratamientoPendiente, true);
    assert.equal(operational[0].rol, role);
    assert.deepEqual(await tratamientoService.obtenerTratamientos(actor), []);
  });
}

test("administrative attention history combines all roles without using professional ownership", async (t) => {
  const citaOriginals = { ...citaRepository };
  const treatmentOriginals = { ...tratamientoRepository };
  t.after(() => {
    restore(citaRepository, citaOriginals);
    restore(tratamientoRepository, treatmentOriginals);
  });
  citaRepository.findAttendedForHistory = async (options) => {
    assert.deepEqual(options, {});
    return [attendedFixture("cosmiatra"), {
      ...attendedFixture("doctor"), _id: "507f1f77bcf86cd799439034",
    }];
  };
  citaRepository.findByProfesional = async () => { assert.fail("administrator must not use professional ownership"); };
  tratamientoRepository.findAll = async () => [{ _id: "real-treatment" }];
  const result = await tratamientoService.obtenerHistorialAtenciones({ id: "admin-1", rol: "administrador" });
  assert.equal(result.length, 3);
  assert.deepEqual(new Set(result.filter((row) => row.origenRegistro === "cita").map((row) => row.rol)),
    new Set(["cosmiatra", "doctor"]));
});

for (const role of ["cosmiatra", "administrador"]) {
  test(`shared report adds attended appointments of both specialties for ${role}`, async (t) => {
    const citaOriginals = { ...citaRepository };
    const treatmentOriginals = { ...tratamientoRepository };
    t.after(() => {
      restore(citaRepository, citaOriginals);
      restore(tratamientoRepository, treatmentOriginals);
    });
    citaRepository.findAttendedForHistory = async (options) => {
      assert.equal(options, undefined);
      return [attendedFixture("cosmiatra"), {
        ...attendedFixture("doctor"), _id: "507f1f77bcf86cd799439034",
      }];
    };
    tratamientoRepository.findForServiceReport = async () => [];
    const result = await tratamientoService.obtenerTratamientosParaReporteServicios({ id: "actor-1", rol: role });
    assert.equal(result.length, 2);
    assert.deepEqual(new Set(result.map((row) => row.rol)), new Set(["cosmiatra", "doctor"]));
    assert.ok(result.every((row) => !Object.hasOwn(row, "observacion") && !Object.hasOwn(row, "imagenes")));
  });
}

test("operational history rejects unauthenticated and unsupported actors before reading appointments", async (t) => {
  const original = citaRepository.findAttendedForHistory;
  t.after(() => { citaRepository.findAttendedForHistory = original; });
  citaRepository.findAttendedForHistory = async () => { assert.fail("unauthorized read"); };
  for (const actor of [null, {}, { id: "actor-1", rol: "cliente" }]) {
    await assert.rejects(tratamientoService.obtenerHistorialAtenciones(actor), (error) => error.statusCode === 403);
  }
});

test("shared report uses persisted aliases for an unverified legacy pair without exposing aliases or clinical fields", async (t) => {
  const citaOriginals = { ...citaRepository };
  const treatmentOriginals = { ...tratamientoRepository };
  t.after(() => {
    restore(citaRepository, citaOriginals);
    restore(tratamientoRepository, treatmentOriginals);
  });
  const cita = attendedFixture();
  delete cita.pacienteId;
  citaRepository.findAttendedForHistory = async () => [cita];
  tratamientoRepository.findForServiceReport = async () => [{
    _id: "507f1f77bcf86cd799439035", nombre: "Nombre corregido",
    pacienteNombresAnteriores: [cita.cliente], rol: cita.rol,
    profesionalId: { _id: attentionProfessionalId, nombre: "Profesional Actual", rol: cita.rol },
    profesional: "Nombre profesional anterior", servicio: cita.servicio,
    fecha: new Date("2026-05-01T00:00:00Z"),
  }];
  const result = await tratamientoService.obtenerTratamientosParaReporteServicios({ id: "admin-1", rol: "administrador" });
  assert.equal(result.length, 1);
  assert.equal(result[0]._id, "507f1f77bcf86cd799439035");
  assert.equal(result[0].cita._id, cita._id);
  assert.equal(result[0].cita.fecha, cita.fecha);
  assert.equal(result[0].profesional, "Profesional Actual");
  for (const field of ["pacienteNombresAnteriores", "observacion", "insumos", "imagenes"]) {
    assert.equal(Object.hasOwn(result[0], field), false);
  }
});

test("the explicit operational history route is authenticated and permits exactly the staff roles", () => {
  const routes = require("../routes/tratamiento.routes");
  const controller = require("../controllers/tratamiento.controller");
  const authMiddleware = require("../middlewares/authJwt");
  const route = routes.stack.find((layer) => layer.route?.path === "/historial-atenciones")?.route;
  assert.equal(route?.methods.get, true);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack.at(-1).handle, controller.obtenerHistorialAtenciones);
  for (const role of ["administrador", "cosmiatra", "doctor"]) {
    let permitted = false;
    route.stack[1].handle({ user: { rol: role } }, {}, () => { permitted = true; });
    assert.equal(permitted, true);
  }
  let status;
  route.stack[1].handle({ user: { rol: "cliente" } }, {
    status(code) { status = code; return this; }, json() {},
  }, () => { assert.fail("unsupported role"); });
  assert.equal(status, 403);
});

test("attended appointment repository uses an immutable owner filter and minimal projections", async (t) => {
  const Cita = require("../models/Cita.model");
  const original = Cita.find;
  t.after(() => { Cita.find = original; });
  const calls = [];
  Cita.find = (criteria) => {
    calls.push({ criteria });
    return {
      select(fields) { calls.at(-1).select = fields; return this; },
      populate(path, fields) { calls.at(-1).populate = [path, fields]; return this; },
      sort(sort) { calls.at(-1).sort = sort; return this; },
      lean() { calls.at(-1).lean = true; return []; },
    };
  };
  await citaRepository.findAttendedForHistory({ professionalId: attentionProfessionalId });
  await citaRepository.findAttendedForHistory();
  assert.deepEqual(calls.map((call) => call.criteria), [
    { estado: "atendido", profesional: attentionProfessionalId }, { estado: "atendido" },
  ]);
  for (const call of calls) {
    assert.equal(call.select, "cliente pacienteId rol profesional servicio fecha estado");
    assert.deepEqual(call.populate, ["profesional", "nombre rol"]);
    assert.deepEqual(call.sort, { fecha: -1 });
    assert.equal(call.lean, true);
  }
});

test("keeps the shared daily services report unavailable to doctor accounts", async () => {
  await assert.rejects(
    tratamientoService.obtenerTratamientosParaReporteServicios({
      id: "doctor-1",
      rol: "doctor",
    }),
    (error) => error.statusCode === 403,
  );
});

test("uses the current referenced professional identity in administrative results", async (t) => {
  const tratamientoOriginals = {
    findAll: tratamientoRepository.findAll,
  };
  t.after(() => restore(tratamientoRepository, tratamientoOriginals));

  tratamientoRepository.findAll = async () => [
    {
      _id: "tratamiento-actualizable",
      profesional: "Dra. Nombre Antiguo",
      rol: "doctor",
      profesionalId: {
        _id: "doctor-1",
        nombre: "Dra. Nombre Actual",
        rol: "doctor",
      },
    },
  ];

  const result = await tratamientoService.obtenerTratamientos({
    id: "admin-1",
    nombre: "Administración",
    rol: "administrador",
  });

  assert.deepEqual(result, [
    {
      _id: "tratamiento-actualizable",
      profesional: "Dra. Nombre Actual",
      profesionalId: "doctor-1",
      rol: "doctor",
    },
  ]);
});

test("synchronizes a professional rename by id and safely migrates legacy rows", async (t) => {
  const citaOriginals = { findByProfesional: citaRepository.findByProfesional };
  const tratamientoOriginals = {
    updateProfessionalIdentityById:
      tratamientoRepository.updateProfessionalIdentityById,
    updateLegacyProfessionalIdentityByCitas:
      tratamientoRepository.updateLegacyProfessionalIdentityByCitas,
  };
  t.after(() => {
    restore(citaRepository, citaOriginals);
    restore(tratamientoRepository, tratamientoOriginals);
  });

  const calls = [];
  tratamientoRepository.updateProfessionalIdentityById = async (...args) => {
    calls.push(["id", ...args]);
    return { modifiedCount: 2 };
  };
  citaRepository.findByProfesional = async (id) => {
    assert.equal(id, "doctor-1");
    return [{ _id: "cita-1" }, { _id: "cita-2" }];
  };
  tratamientoRepository.updateLegacyProfessionalIdentityByCitas = async (...args) => {
    calls.push(["citas", ...args]);
    return { modifiedCount: 1 };
  };

  const result = await tratamientoService.sincronizarIdentidadProfesional({
    user: {
      _id: "doctor-1",
      nombre: "Dra. Perfil Actual",
      rol: "doctor",
    },
  });

  assert.deepEqual(calls, [
    ["id", "doctor-1", { nombre: "Dra. Perfil Actual", rol: "doctor" }],
    [
      "citas",
      ["cita-1", "cita-2"],
      "doctor-1",
      { nombre: "Dra. Perfil Actual", rol: "doctor" },
    ],
  ]);
  assert.deepEqual(result, {
    byProfessionalId: { modifiedCount: 2 },
    byAppointments: { modifiedCount: 1 },
    reconciliation: { modified: 0 },
  });
});

for (const fail of [false, true]) {
  test(`treatment registration ${fail ? "compensates" : "persists"} the same patient identity on its appointment`, async (t) => {
    const id = "507f1f77bcf86cd799439020";
    const professionalId = "507f1f77bcf86cd799439021";
    const pacienteId = "507f1f77bcf86cd799439022";
    const cita = { _id: id, profesional: new Types.ObjectId(professionalId), cliente: "Camila Pérez", estado: "atendido" };
    const citaOriginals = { ...citaRepository };
    const treatmentOriginals = { ...tratamientoRepository };
    const identityOriginals = { ...patientIdentityService };
    t.after(() => {
      Object.assign(citaRepository, citaOriginals);
      Object.assign(tratamientoRepository, treatmentOriginals);
      Object.assign(patientIdentityService, identityOriginals);
    });
    const events = [];
    citaRepository.findById = async () => cita;
    citaRepository.marcarComoAtendidaSiPendientePorProfesional = async () => cita;
    citaRepository.assignPacienteIdIfMissing = async (receivedId, receivedPatientId, guard) => {
      assert.equal(receivedId, id);
      assert.equal(receivedPatientId, pacienteId);
      assert.equal(guard.cliente, cita.cliente);
      events.push("assigned");
      return cita;
    };
    citaRepository.clearPacienteIdIfCurrent = async () => { events.push("identityRestored"); };
    citaRepository.restaurarComoPendiente = async () => { events.push("statusRestored"); };
    patientIdentityService.resolvePatientForRegistration = async () => ({ pacienteId, nombre: "Camila Pérez" });
    tratamientoRepository.create = async (data) => {
      assert.equal(data.pacienteId, pacienteId);
      assert.equal(data.nombre, "Camila Pérez");
      events.push("create");
      if (fail) throw new Error("write failed");
      return data;
    };
    const create = () => tratamientoService.crearTratamiento({ citaId: id, nombre: "Camila", celular: "987654321",
      sexo: "Femenino", fecha: "2026-10-09", servicio: ["Péptidos"] }, [],
    { id: professionalId, rol: "doctor", nombre: "Dra. Actual" });
    if (fail) {
      await assert.rejects(create(), /write failed/);
      assert.deepEqual(events, ["assigned", "create", "identityRestored", "statusRestored"]);
    } else {
      const result = await create();
      assert.equal(result.cita, id);
      assert.deepEqual(events, ["assigned", "create"]);
    }
  });
}

for (const role of ["doctor", "cosmiatra"]) {
  test(`${role} registration reuses missing intake fields from the appointment's existing patient id`, async (t) => {
    const id = "507f1f77bcf86cd799439040";
    const professionalId = "507f1f77bcf86cd799439041";
    const pacienteId = "507f1f77bcf86cd799439042";
    const cita = { _id: id, pacienteId, cliente: "Camila Pérez", profesional: professionalId, rol: role, estado: "atendido" };
    const citaOriginals = { ...citaRepository };
    const treatmentOriginals = { ...tratamientoRepository };
    const identityOriginals = { ...patientIdentityService };
    const demographicsOriginals = { ...patientDemographicsService };
    t.after(() => {
      Object.assign(citaRepository, citaOriginals);
      Object.assign(tratamientoRepository, treatmentOriginals);
      Object.assign(patientIdentityService, identityOriginals);
      Object.assign(patientDemographicsService, demographicsOriginals);
    });
    citaRepository.findById = async () => cita;
    citaRepository.marcarComoAtendidaSiPendientePorProfesional = async () => cita;
    citaRepository.assignPacienteIdIfMissing = async () => assert.fail("must not assign a second identity");
    patientDemographicsService.getStoredForPatient = async (id) => {
      assert.equal(id, pacienteId);
      return { sexo: "Femenino", celular: "987654321" };
    };
    patientIdentityService.resolvePatientForRegistration = async (input) => {
      assert.equal(input.cita.pacienteId, pacienteId);
      assert.equal(input.sexo, "Femenino");
      assert.equal(input.celular, "987654321");
      return { pacienteId, nombre: "Camila Pérez" };
    };
    tratamientoRepository.create = async (data) => data;
    const result = await tratamientoService.crearTratamiento({ citaId: id, nombre: "Camila Pérez",
      servicio: ["Atención"], fecha: "2026-10-15", sexo: "", celular: "" }, [],
    { id: professionalId, nombre: "Profesional Actual", rol: role });
    assert.equal(result.pacienteId, pacienteId);
    assert.equal(result.sexo, "Femenino");
    assert.equal(result.celular, "987654321");
    assert.equal(result.profesionalId, professionalId);
    assert.equal(result.rol, role);
  });
}
