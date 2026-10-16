const assert = require("node:assert/strict");
const test = require("node:test");
const { Types } = require("mongoose");
const { createPatientDemographicsService } = require("./patientDemographics.service");

const citaId = "507f1f77bcf86cd799439001";
const patientId = "507f1f77bcf86cd799439002";
const professionalId = "507f1f77bcf86cd799439003";
const otherId = "507f1f77bcf86cd799439004";

for (const role of ["doctor", "cosmiatra"]) {
  test(`${role} receives the same patient's intake data, not the other specialty's history`, async () => {
    const actor = { id: professionalId, rol: role };
    const calls = [];
    const service = createPatientDemographicsService({ repository: {
      findAppointment: async (id) => {
        assert.equal(id, citaId);
        return { cliente: "Camila Pérez", profesional: new Types.ObjectId(professionalId), rol: role,
          pacienteId: new Types.ObjectId(patientId) };
      },
      findLatestByPatientId: async (id) => {
        calls.push(id);
        return { tratamientos: [{ pacienteId: id, sexo: "mujer", celular: "+51 987 654 321",
          observacion: "private clinical note", imagenes: ["private asset"], updatedAt: "2026-10-10" }], historias: [] };
      },
    } });
    assert.deepEqual(await service.getByAppointment(citaId, actor), {
      nombre: "Camila Pérez", pacienteId: patientId, sexo: "Femenino", celular: "987654321",
    });
    assert.deepEqual(calls, [patientId]);
  });
}

test("the first visit remains editable and never searches by the patient's name", async () => {
  const service = createPatientDemographicsService({ repository: {
    findAppointment: async () => ({ cliente: "Homónima", profesional: professionalId, rol: "doctor" }),
    findLatestByPatientId: async () => assert.fail("unverified name must not query another patient's intake data"),
  } });
  assert.deepEqual(await service.getByAppointment(citaId, { id: professionalId, rol: "doctor" }), {
    nombre: "Homónima", pacienteId: null, sexo: "", celular: "",
  });
});

test("rejects invalid ids, missing actors and unsupported roles before reading an appointment", async () => {
  const service = createPatientDemographicsService({ repository: {
    findAppointment: async () => assert.fail("unauthorized query"),
  } });
  for (const actor of [undefined, {}, { id: professionalId, rol: "administrador" }, { id: professionalId, rol: "cliente" }]) {
    await assert.rejects(service.getByAppointment(citaId, actor), (error) => error.statusCode === 403);
  }
  for (const id of ["invalid", { $ne: null }, [citaId]]) {
    await assert.rejects(service.getByAppointment(id, { id: professionalId, rol: "doctor" }),
      (error) => error.statusCode === 400);
  }
});

test("an assigned professional cannot query another appointment or forge their specialty", async () => {
  const service = createPatientDemographicsService({ repository: {
    findAppointment: async () => ({ profesional: professionalId, rol: "doctor", pacienteId: patientId }),
    findLatestByPatientId: async () => assert.fail("must authorize the appointment before querying demographics"),
  } });
  for (const actor of [{ id: otherId, rol: "doctor" }, { id: professionalId, rol: "cosmiatra" }]) {
    await assert.rejects(service.getByAppointment(citaId, actor), (error) => error.statusCode === 403);
  }
});

test("an appointment that does not exist returns 404", async () => {
  const service = createPatientDemographicsService({ repository: { findAppointment: async () => null } });
  await assert.rejects(service.getByAppointment(citaId, { id: professionalId, rol: "doctor" }),
    (error) => error.statusCode === 404);
});

test("only the latest nonblank fields with the same immutable identity are shared", async () => {
  const service = createPatientDemographicsService({ repository: {
    findLatestByPatientId: async () => ({
      tratamientos: [
        { pacienteId: patientId, sexo: "Femenino", celular: "987654321", updatedAt: "2026-10-01" },
        { pacienteId: otherId, sexo: "Masculino", celular: "999999999", updatedAt: "2026-10-15" },
      ],
      historias: [{ pacienteId: patientId, paciente: { sexo: "", celular: "912345678" }, updatedAt: "2026-10-12" }],
    }),
  } });
  assert.deepEqual(await service.getStoredForPatient(patientId), { sexo: "Femenino", celular: "912345678" });
});

test("invalid stored fields are not returned as valid prefilled patient data", async () => {
  const service = createPatientDemographicsService({ repository: {
    findLatestByPatientId: async () => ({ tratamientos: [{ pacienteId: patientId, sexo: "not a valid sex", celular: "bad" }], historias: [] }),
  } });
  assert.deepEqual(await service.getStoredForPatient(patientId), { sexo: "", celular: "" });
});

test("the new HTTP lookup is authenticated, professional-only and independent of name search", () => {
  const router = require("../routes/tratamiento.routes");
  const auth = require("../middlewares/authJwt");
  const controller = require("../controllers/tratamiento.controller");
  const route = router.stack.find((layer) => layer.route?.path === "/paciente-por-cita/:citaId")?.route;
  assert.equal(route?.methods.get, true);
  assert.equal(route.stack[0].handle, auth);
  assert.equal(route.stack.at(-1).handle, controller.obtenerPacientePorCita);
  for (const rol of ["doctor", "cosmiatra"]) {
    let allowed = false;
    route.stack[1].handle({ user: { rol } }, {}, () => { allowed = true; });
    assert.equal(allowed, true);
  }
  for (const rol of ["administrador", "cliente"]) {
    let status;
    route.stack[1].handle({ user: { rol } }, {
      status(code) { status = code; return this; }, json() {},
    }, () => assert.fail("must not grant a new role access"));
    assert.equal(status, 403);
  }
});
