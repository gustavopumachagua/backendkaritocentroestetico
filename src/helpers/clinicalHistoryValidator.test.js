const assert = require("node:assert/strict");
const test = require("node:test");
const {
  getPayloadValidationErrors,
  getMissingFinalizationSections,
} = require("./clinicalHistoryValidator");

test("permite borradores con campos clínicos numéricos válidos", () => {
  const errors = getPayloadValidationErrors({
    dni: "12345678",
    edad: "31",
    pesoActual: "71.5",
    presionSistolica: "120",
  });

  assert.deepEqual(errors, []);
});

test("rechaza DNI y valores clínicos no numéricos", () => {
  const errors = getPayloadValidationErrors({
    dni: "1234ABCD",
    edad: "treinta",
    imc: "veintidós",
  });

  assert.ok(errors.some((message) => message.includes("DNI")));
  assert.ok(errors.some((message) => message.includes("edad")));
  assert.ok(errors.some((message) => message.includes("imc")));
});

test("rechaza datos de identificación de una persona menor de edad", () => {
  const errors = getPayloadValidationErrors({
    edad: "17",
    fechaNacimiento: "2010-01-01",
  });

  assert.ok(errors.some((message) => message.includes("mayor de edad")));
});

test("acepta edad y nacimiento de una persona adulta", () => {
  const errors = getPayloadValidationErrors(
    {
      edad: "18",
      fechaNacimiento: "2008-10-08",
    },
    undefined,
    new Date(2026, 9, 8),
  );

  assert.deepEqual(errors, []);
});

test("rechaza una edad que no coincide con la fecha de nacimiento", () => {
  const errors = getPayloadValidationErrors(
    {
      edad: "18",
      fechaNacimiento: "2000-10-08",
    },
    undefined,
    new Date(2026, 9, 8),
  );

  assert.ok(errors.some((message) => message.includes("coherentes")));
});

test("omite gineco-obstetricia y renumera los pasos para pacientes hombres", () => {
  const missingSections = getMissingFinalizationSections({ sexo: "Masculino" });

  assert.equal(
    missingSections.some((section) => section.id === "gineco-obstetricos"),
    false,
  );
  assert.equal(
    missingSections.find((section) => section.id === "medicacion-actual").section,
    "VI",
  );
});
