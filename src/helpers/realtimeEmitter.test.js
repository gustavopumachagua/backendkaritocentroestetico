const test = require("node:test");
const assert = require("node:assert/strict");
const {
  emitCitaEvent,
  emitClinicalControlEvent,
  emitTratamientoEvent,
  disconnectUserSockets,
  emitProfessionalUpdatedEvent,
  emitPatientUpdatedEvent,
} = require("./realtimeEmitter");

function createIoSpy() {
  const emissions = [];
  return {
    emissions,
    to(room) {
      return {
        emit(event, payload) {
          emissions.push({ room, event, payload });
        },
      };
    },
  };
}

test("appointment events reach only reception, admins and the assigned doctor", () => {
  const io = createIoSpy();
  const cita = {
    rol: "doctor",
    profesional: { _id: "doctor-42" },
  };

  emitCitaEvent(io, "citaActualizada", cita);

  assert.deepEqual(
    io.emissions.map(({ room }) => room).sort(),
    ["role:administrador", "role:cosmiatra", "user:doctor-42"],
  );
});

test("clinical controls and treatments do not broadcast to every socket", () => {
  const io = createIoSpy();
  emitClinicalControlEvent(io, "historiaClinicaFinalizada", { paciente: {} });
  emitTratamientoEvent(
    io,
    "tratamientoActualizado",
    { tratamiento: { profesionalId: "doctor-42" } },
  );

  assert.deepEqual(
    io.emissions.map(({ room }) => room).sort(),
    [
      "role:administrador",
      "role:administrador",
      "role:cosmiatra",
      "user:doctor-42",
    ],
  );
});

test("revoking a session disconnects only that user's realtime room", () => {
  const disconnects = [];
  const io = {
    in(room) {
      return {
        disconnectSockets(close) {
          disconnects.push({ room, close });
        },
      };
    },
  };

  disconnectUserSockets(io, "doctor-42");

  assert.deepEqual(disconnects, [{ room: "user:doctor-42", close: true }]);
});

test("professional updates expose only public identity to authenticated role rooms", () => {
  const rooms = [];
  const emissions = [];
  const io = {
    to(room) { rooms.push(room); return this; },
    emit(event, payload) { emissions.push({ event, payload }); },
  };
  emitProfessionalUpdatedEvent(io, {
    id: "doctor-42", nombre: "Nombre Actual", rol: "doctor",
    email: "private@example.test", cmp: "123456", firmaDigital: "private.webp",
  });
  assert.deepEqual(rooms, ["role:administrador", "role:doctor", "role:cosmiatra"]);
  assert.deepEqual(emissions, [{ event: "profesionalActualizado", payload: { id: "doctor-42", nombre: "Nombre Actual", rol: "doctor" } }]);
});

test("patient corrections send minimal metadata only to affected professional rooms", () => {
  const rooms = [];
  const emissions = [];
  const io = {
    to(room) { rooms.push(room); return this; },
    emit(event, payload) { emissions.push({ event, payload }); },
  };
  emitPatientUpdatedEvent(io, {
    pacienteId: "patient-1", nombre: "Nombre completo", nombreAnterior: "Nombre",
    datosFormulario: { diagnostico: "private" }, professionalIds: ["private"],
  }, ["doctor-1", "cosmiatra-1", "doctor-1"]);
  assert.deepEqual(rooms, ["role:administrador", "role:cosmiatra", "user:doctor-1", "user:cosmiatra-1"]);
  assert.deepEqual(emissions, [{ event: "pacienteActualizado", payload: {
    pacienteId: "patient-1", nombre: "Nombre completo", nombreAnterior: "Nombre",
  } }]);
});
