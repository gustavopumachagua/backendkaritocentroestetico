const assert = require("node:assert/strict");
const test = require("node:test");
const {
  getClinicalExamRowsValidationError,
  hasCompleteClinicalExamRows,
} = require("./clinicalExamRows");

const completeRow = { examen: "Glucosa en ayunas", resultado: "92 mg/dL" };

test("admite borradores sin filas o con filas vacías", () => {
  for (const rows of [[], [{ examen: "", resultado: "" }]]) {
    assert.equal(getClinicalExamRowsValidationError(rows), null);
    assert.equal(hasCompleteClinicalExamRows(rows), false);
  }
});

test("admite hasta cien filas con texto limitado", () => {
  const rows = Array.from({ length: 100 }, () => ({ ...completeRow }));
  assert.equal(getClinicalExamRowsValidationError(rows), null);
  assert.equal(hasCompleteClinicalExamRows(rows), true);
  assert.equal(
    getClinicalExamRowsValidationError([
      { examen: "x".repeat(160), resultado: "y".repeat(2000) },
    ]),
    null,
  );
});

test("rechaza listas o textos que exceden los límites", () => {
  for (const rows of [
    Array.from({ length: 101 }, () => ({ ...completeRow })),
    [{ examen: "x".repeat(161), resultado: "normal" }],
    [{ examen: "Glucosa", resultado: "x".repeat(2001) }],
  ]) {
    assert.equal(typeof getClinicalExamRowsValidationError(rows), "string");
    assert.equal(hasCompleteClinicalExamRows(rows), false);
  }
});

test("rechaza coerciones, objetos de consulta y claves adicionales", () => {
  for (const rows of [
    undefined,
    null,
    {},
    "Glucosa: 92",
    [null],
    ["Glucosa: 92"],
    [["Glucosa", "92"]],
    [{ examen: "Glucosa" }],
    [{ examen: "Glucosa", resultado: 92 }],
    [{ examen: 123, resultado: "92" }],
    [{ examen: { $ne: null }, resultado: "92" }],
    [{ ...completeRow, url: "https://example.com" }],
    [JSON.parse('{"examen":"Glucosa","resultado":"92","__proto__":{}}')],
    [new Date()],
  ]) {
    assert.equal(typeof getClinicalExamRowsValidationError(rows), "string");
    assert.equal(hasCompleteClinicalExamRows(rows), false);
  }
});

test("ignora filas totalmente vacías al finalizar, pero no las parciales", () => {
  assert.equal(
    hasCompleteClinicalExamRows([
      { examen: " ", resultado: "\n" },
      completeRow,
      { examen: "", resultado: "" },
    ]),
    true,
  );
  for (const row of [
    { examen: "Hemoglobina", resultado: "" },
    { examen: " ", resultado: "12 g/dL" },
  ]) {
    assert.equal(getClinicalExamRowsValidationError([completeRow, row]), null);
    assert.equal(hasCompleteClinicalExamRows([completeRow, row]), false);
  }
});

test("la validación no modifica el contenido clínico ni elimina filas", () => {
  const rows = Object.freeze([
    Object.freeze({ examen: "  Glucosa  ", resultado: "  92 mg/dL\n" }),
    Object.freeze({ examen: "", resultado: "" }),
  ]);
  assert.equal(getClinicalExamRowsValidationError(rows), null);
  assert.equal(hasCompleteClinicalExamRows(rows), true);
  assert.equal(rows[0].examen, "  Glucosa  ");
  assert.equal(rows.length, 2);
});
