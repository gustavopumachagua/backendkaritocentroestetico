const assert = require("node:assert/strict");
const test = require("node:test");

const userService = require("./user.service");
const userRepository = require("../repositories/user.repository");
const historiaClinicaService = require("./historiaClinica.service");
const tratamientoService = require("./tratamiento.service");

const DOCTOR_ID = "507f1f77bcf86cd799439011";

function restore(target, originals) {
  Object.assign(target, originals);
}

test("propagates an updated doctor's profile to histories and operational records", async (t) => {
  const userOriginals = {
    findById: userRepository.findById,
    updateProfileById: userRepository.updateProfileById,
  };
  const historyOriginals = {
    sincronizarDatosMedicoEnHistorias:
      historiaClinicaService.sincronizarDatosMedicoEnHistorias,
  };
  const treatmentOriginals = {
    sincronizarIdentidadProfesional:
      tratamientoService.sincronizarIdentidadProfesional,
  };
  t.after(() => {
    restore(userRepository, userOriginals);
    restore(historiaClinicaService, historyOriginals);
    restore(tratamientoService, treatmentOriginals);
  });

  const previousDoctor = {
    _id: DOCTOR_ID,
    nombre: "Dra. Nombre Anterior",
    rol: "doctor",
  };
  const doctor = {
    _id: DOCTOR_ID,
    nombre: "Dra. Nombre Nuevo",
    email: "doctora@example.test",
    rol: "doctor",
    avatar: "avatar.webp",
    cmp: "654321",
    firmaDigital: "firma.webp",
  };
  const synchronizationCalls = [];
  const treatmentSynchronizationCalls = [];

  userRepository.findById = async (id) => {
    assert.equal(id, DOCTOR_ID);
    return previousDoctor;
  };
  userRepository.updateProfileById = async (id, updateData, previousName) => {
    assert.equal(id, DOCTOR_ID);
    assert.equal(previousName, "Dra. Nombre Anterior");
    assert.deepEqual(updateData, {
      nombre: "Dra. Nombre Nuevo",
      cmp: "654321",
    });
    return doctor;
  };
  historiaClinicaService.sincronizarDatosMedicoEnHistorias = async (user) => {
    synchronizationCalls.push(user);
  };
  tratamientoService.sincronizarIdentidadProfesional = async (input) => {
    treatmentSynchronizationCalls.push(input);
  };

  const result = await userService.actualizarPerfil(DOCTOR_ID, {
    nombre: "  Dra. Nombre Nuevo  ",
    cmp: "654321",
  });

  assert.deepEqual(synchronizationCalls, [doctor]);
  assert.deepEqual(treatmentSynchronizationCalls, [
    {
      user: doctor,
    },
  ]);
  assert.deepEqual(result, {
    id: DOCTOR_ID,
    nombre: "Dra. Nombre Nuevo",
    email: "doctora@example.test",
    rol: "doctor",
    avatar: "avatar.webp",
    cmp: "654321",
    firmaDigital: "firma.webp",
  });
});

test("propagates a cosmiatra rename to operational records without touching histories", async (t) => {
  const userOriginals = {
    findById: userRepository.findById,
    updateProfileById: userRepository.updateProfileById,
  };
  const historyOriginals = {
    sincronizarDatosMedicoEnHistorias:
      historiaClinicaService.sincronizarDatosMedicoEnHistorias,
  };
  const treatmentOriginals = {
    sincronizarIdentidadProfesional:
      tratamientoService.sincronizarIdentidadProfesional,
  };
  t.after(() => {
    restore(userRepository, userOriginals);
    restore(historiaClinicaService, historyOriginals);
    restore(tratamientoService, treatmentOriginals);
  });

  userRepository.findById = async () => ({
    _id: DOCTOR_ID,
    nombre: "Karito Anterior",
    rol: "cosmiatra",
  });
  userRepository.updateProfileById = async (id, fields, previousName) => {
    assert.equal(previousName, "Karito Anterior");
    return {
    _id: DOCTOR_ID,
    nombre: "Karito Actualizada",
    email: "cosmiatra@example.test",
    rol: "cosmiatra",
    avatar: "avatar.webp",
    cmp: null,
    firmaDigital: null,
    };
  };
  const calls = [];
  tratamientoService.sincronizarIdentidadProfesional = async (input) => {
    calls.push(input);
  };
  historiaClinicaService.sincronizarDatosMedicoEnHistorias = async () => {
    throw new Error("No se debe llamar para una cosmiatra.");
  };

  const result = await userService.actualizarPerfil(DOCTOR_ID, {
    nombre: "Karito Actualizada",
  });

  assert.equal(result.rol, "cosmiatra");
  assert.equal(result.nombre, "Karito Actualizada");
  assert.deepEqual(calls, [
    {
      user: {
        _id: DOCTOR_ID,
        nombre: "Karito Actualizada",
        email: "cosmiatra@example.test",
        rol: "cosmiatra",
        avatar: "avatar.webp",
        cmp: null,
        firmaDigital: null,
      },
    },
  ]);
});

test("preserves a previous name for safe directory reconciliation after a rename", async (t) => {
  const userOriginals = {
    findById: userRepository.findById,
    updateProfileById: userRepository.updateProfileById,
  };
  const historyOriginals = {
    sincronizarDatosMedicoEnHistorias:
      historiaClinicaService.sincronizarDatosMedicoEnHistorias,
  };
  const treatmentOriginals = {
    sincronizarIdentidadProfesional:
      tratamientoService.sincronizarIdentidadProfesional,
  };
  t.after(() => {
    restore(userRepository, userOriginals);
    restore(historiaClinicaService, historyOriginals);
    restore(tratamientoService, treatmentOriginals);
  });

  userRepository.findById = async () => ({
    _id: DOCTOR_ID,
    nombre: "Nombre Compartido",
    rol: "doctor",
  });
  userRepository.updateProfileById = async (id, fields, previousName) => {
    assert.equal(previousName, "Nombre Compartido");
    return {
    _id: DOCTOR_ID,
    nombre: "Dra. Identidad Única",
    email: "doctora@example.test",
    rol: "doctor",
    cmp: "123456",
    };
  };

  const calls = [];
  tratamientoService.sincronizarIdentidadProfesional = async (input) => {
    calls.push(input);
  };
  historiaClinicaService.sincronizarDatosMedicoEnHistorias = async () => {};

  await userService.actualizarPerfil(DOCTOR_ID, {
    nombre: "Dra. Identidad Única",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].user.nombre, "Dra. Identidad Única");
});
