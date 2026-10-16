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

const legacyExamFields = {
  fechaLaboratorio: "2026-10-15",
  glucosaAyunas: "92",
  hba1c: "5.1",
  creatinina: "0.8",
  tfge: "90",
  tgoAst: "20",
  tgpAlt: "21",
  colesterolTotal: "170",
  ldl: "100",
  hdl: "60",
  trigliceridos: "100",
  tsh: "2.5",
};

function isExamSectionMissing(formData) {
  return getMissingFinalizationSections(formData).some(
    (section) => section.id === "examenes-auxiliares",
  );
}

test("admite exámenes dinámicos incompletos únicamente como borrador", () => {
  for (const examenesAuxiliares of [
    [],
    [{ examen: "", resultado: "" }],
    [{ examen: "Glucosa", resultado: "" }],
  ]) {
    const formData = { fechaLaboratorio: "2026-10-15", examenesAuxiliares };
    assert.deepEqual(getPayloadValidationErrors(formData), []);
    assert.equal(isExamSectionMissing(formData), true);
  }
});

test("finaliza exámenes dinámicos con fecha y una fila completa sin exigir campos antiguos", () => {
  const formData = {
    fechaLaboratorio: "2026-10-15",
    examenesAuxiliares: [
      { examen: "Glucosa", resultado: "92 mg/dL" },
      { examen: "", resultado: "" },
    ],
  };
  assert.deepEqual(getPayloadValidationErrors(formData), []);
  assert.equal(isExamSectionMissing(formData), false);
  assert.equal(isExamSectionMissing({ ...formData, fechaLaboratorio: "" }), true);
  assert.equal(
    isExamSectionMissing({ ...formData, fechaLaboratorio: "2026-02-30" }),
    true,
  );
});

test("las filas nuevas son autoritativas aunque persistan resultados antiguos", () => {
  assert.equal(isExamSectionMissing(legacyExamFields), false);
  assert.equal(
    isExamSectionMissing({ ...legacyExamFields, examenesAuxiliares: [] }),
    true,
  );
  assert.equal(
    isExamSectionMissing({
      ...legacyExamFields,
      examenesAuxiliares: [{ examen: "Perfil hepático", resultado: "" }],
    }),
    true,
  );
  assert.equal(
    isExamSectionMissing({ ...legacyExamFields, examenesAuxiliares: null }),
    true,
  );
});

test("mantiene la validación antigua para historias sin filas dinámicas", () => {
  assert.equal(isExamSectionMissing(legacyExamFields), false);
  for (const field of Object.keys(legacyExamFields)) {
    assert.equal(isExamSectionMissing({ ...legacyExamFields, [field]: "" }), true);
  }
});

test("el guardado rechaza filas dinámicas inválidas o con exceso de tamaño", () => {
  for (const examenesAuxiliares of [
    "Glucosa: 92",
    { examen: "Glucosa", resultado: "92" },
    [{ examen: "Glucosa", resultado: { $gt: 0 } }],
    [{ examen: "Glucosa", resultado: "92", extra: "no permitido" }],
    [{ examen: "x".repeat(161), resultado: "92" }],
    [{ examen: "Glucosa", resultado: "x".repeat(2001) }],
    Array.from({ length: 101 }, () => ({ examen: "Glucosa", resultado: "92" })),
  ]) {
    assert.ok(getPayloadValidationErrors({ examenesAuxiliares }).length > 0);
  }
});
