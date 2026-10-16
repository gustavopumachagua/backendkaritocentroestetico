const MAX_EXAM_ROWS = 100;
const MAX_EXAM_NAME_LENGTH = 160;
const MAX_EXAM_RESULT_LENGTH = 2000;
const EXAM_ROW_FIELDS = ["examen", "resultado"];

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Los borradores admiten filas vacías, pero no objetos arbitrarios ni valores
 * que no sean texto. La validación estructural también se usa al finalizar,
 * para no tratar un valor corrupto como una respuesta clínica válida.
 */
function getClinicalExamRowsValidationError(rows) {
  if (!Array.isArray(rows)) {
    return "El campo examenesAuxiliares debe ser una lista.";
  }

  if (rows.length > MAX_EXAM_ROWS) {
    return `Los exámenes auxiliares permiten hasta ${MAX_EXAM_ROWS} filas.`;
  }

  for (const row of rows) {
    if (
      !isPlainObject(row) ||
      Object.keys(row).length !== EXAM_ROW_FIELDS.length ||
      !EXAM_ROW_FIELDS.every(
        (field) =>
          Object.prototype.hasOwnProperty.call(row, field) &&
          typeof row[field] === "string",
      )
    ) {
      return "Cada examen auxiliar debe contener únicamente examen y resultado como texto.";
    }

    if (row.examen.length > MAX_EXAM_NAME_LENGTH) {
      return `El nombre de cada examen auxiliar permite hasta ${MAX_EXAM_NAME_LENGTH} caracteres.`;
    }

    if (row.resultado.length > MAX_EXAM_RESULT_LENGTH) {
      return `El resultado de cada examen auxiliar permite hasta ${MAX_EXAM_RESULT_LENGTH} caracteres.`;
    }
  }

  return null;
}

function hasCompleteClinicalExamRows(rows) {
  if (getClinicalExamRowsValidationError(rows)) return false;

  const answeredRows = rows.filter(
    (row) => row.examen.trim() || row.resultado.trim(),
  );

  return (
    answeredRows.length > 0 &&
    answeredRows.every((row) => row.examen.trim() && row.resultado.trim())
  );
}

module.exports = {
  getClinicalExamRowsValidationError,
  hasCompleteClinicalExamRows,
};
