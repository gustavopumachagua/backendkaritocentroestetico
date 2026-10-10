const ROMAN_NUMBERS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
  "XIV",
  "XV",
];

const MAX_FORM_BYTES = 512 * 1024;
const MAX_FORM_FIELDS = 180;
const MAX_NESTING_DEPTH = 6;
const MAX_ARRAY_ITEMS = 100;
const MAX_STRING_LENGTH = 10000;

const NUMERIC_FIELDS = [
  "pesoMaximo",
  "pesoHabitual",
  "pesoActual",
  "talla",
  "imc",
  "perimetroAbdominal",
  "presionSistolica",
  "presionDiastolica",
  "frecuenciaCardiaca",
  "pesoClinico",
  "tallaClinica",
  "imcClinico",
  "perimetroAbdominalClinico",
];

const ARRAY_FIELDS = [
  "enfermedadesAntecedentes",
  "antecedentesFamiliares",
  "tratamientosPreviosPeso",
  "sintomasActuales",
  "conductaPlan",
];

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function toText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function hasText(value) {
  return toText(value).length > 0;
}

function hasArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function includes(value, expected) {
  return Array.isArray(value) && value.includes(expected);
}

function isDecimal(value) {
  return /^\d+(\.\d+)?$/.test(toText(value));
}

function isDate(value) {
  const text = toText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;

  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

/**
 * Obtiene una fecha de calendario sin pasar por el parser UTC de JavaScript.
 * Los valores de `<input type="date">` son fechas de calendario: convertirlos
 * con `new Date("YYYY-MM-DD")` puede desplazarlos un día según la zona horaria.
 */
function getCalendarDate(value) {
  if (!isDate(value)) return null;

  const [year, month, day] = toText(value).split("-").map(Number);
  return { year, month, day };
}

function getTodayCalendar(now = new Date()) {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

/**
 * Calcula la edad exacta al día de hoy. La resta de años por sí sola falla
 * para cumpleaños que todavía no ocurrieron este año.
 */
function calculateAgeFromBirthDate(value, now = new Date()) {
  const birthDate = getCalendarDate(value);
  if (!birthDate) return null;

  const today = getTodayCalendar(now);
  const isFutureDate =
    birthDate.year > today.year ||
    (birthDate.year === today.year &&
      (birthDate.month > today.month ||
        (birthDate.month === today.month && birthDate.day > today.day)));

  if (isFutureDate) return null;

  let age = today.year - birthDate.year;
  const birthdayHasNotOccurred =
    birthDate.month > today.month ||
    (birthDate.month === today.month && birthDate.day > today.day);

  if (birthdayHasNotOccurred) age -= 1;
  return age;
}

function isAdultAge(value, { min = 18, max = 130 } = {}) {
  const text = toText(value);
  if (!/^\d+$/.test(text)) return false;

  const age = Number(text);
  return age >= min && age <= max;
}

function isAdultBirthDate(value, now = new Date()) {
  const age = calculateAgeFromBirthDate(value, now);
  return age !== null && age >= 18;
}

function isAgeConsistentWithBirthDate(
  birthDateValue,
  ageValue,
  now = new Date(),
) {
  if (!isAdultAge(ageValue)) return false;

  const calculatedAge = calculateAgeFromBirthDate(birthDateValue, now);
  return calculatedAge !== null && calculatedAge === Number(toText(ageValue));
}

function isFemale(sexo) {
  const normalized = toText(sexo)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return ["f", "femenino", "mujer", "female"].includes(normalized);
}

function inspectValue(value, depth = 0) {
  if (depth > MAX_NESTING_DEPTH) {
    return "La información del formulario tiene demasiados niveles.";
  }

  if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
    return "Un campo del formulario supera el tamaño permitido.";
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      return "Una lista del formulario supera el tamaño permitido.";
    }

    for (const item of value) {
      const error = inspectValue(item, depth + 1);
      if (error) return error;
    }
    return null;
  }

  if (value && typeof value === "object") {
    if (!isPlainObject(value)) {
      return "El formulario contiene una estructura inválida.";
    }

    for (const nestedValue of Object.values(value)) {
      const error = inspectValue(nestedValue, depth + 1);
      if (error) return error;
    }
  }

  return null;
}

/**
 * Valida la forma de cualquier guardado. Los borradores pueden estar
 * incompletos, pero no pueden persistir datos corruptos o valores numéricos
 * inválidos en los campos clínicos definidos.
 */
function getPayloadValidationErrors(formData, currentStep, now = new Date()) {
  const errors = [];

  if (!isPlainObject(formData)) {
    return ["formData debe ser un objeto."];
  }

  if (Object.keys(formData).length > MAX_FORM_FIELDS) {
    errors.push("El formulario contiene demasiados campos.");
  }

  try {
    if (Buffer.byteLength(JSON.stringify(formData), "utf8") > MAX_FORM_BYTES) {
      errors.push("El formulario supera el tamaño permitido.");
    }
  } catch {
    errors.push("El formulario no se pudo serializar.");
  }

  const structureError = inspectValue(formData);
  if (structureError) errors.push(structureError);

  const dni = toText(formData.dni);
  if (dni && !/^\d{1,8}$/.test(dni)) {
    errors.push("El DNI solo puede contener hasta 8 dígitos numéricos.");
  }

  const edad = toText(formData.edad);
  if (edad && !isAdultAge(edad)) {
    errors.push("La edad debe ser numérica y corresponder a una persona mayor de edad.");
  }

  const fechaNacimiento = toText(formData.fechaNacimiento);
  if (fechaNacimiento && !isAdultBirthDate(fechaNacimiento, now)) {
    errors.push("La fecha de nacimiento debe corresponder a una persona mayor de edad.");
  }

  // Los borradores pueden estar incompletos, pero si los dos datos existen no
  // pueden contradecirse. Esto evita que un guardado parcial deje una edad
  // distinta de la que corresponde a la fecha de nacimiento.
  if (
    edad &&
    fechaNacimiento &&
    isAdultAge(edad) &&
    isAdultBirthDate(fechaNacimiento, now) &&
    !isAgeConsistentWithBirthDate(fechaNacimiento, edad, now)
  ) {
    errors.push("La edad y la fecha de nacimiento deben ser coherentes.");
  }

  for (const field of NUMERIC_FIELDS) {
    const value = toText(formData[field]);
    if (value && !isDecimal(value)) {
      errors.push(`El campo ${field} solo acepta números y decimales.`);
    }
  }

  for (const field of ARRAY_FIELDS) {
    if (formData[field] !== undefined && !Array.isArray(formData[field])) {
      errors.push(`El campo ${field} debe ser una lista.`);
    }
  }

  if (
    currentStep !== undefined &&
    (!Number.isInteger(currentStep) || currentStep < 0 || currentStep > 14)
  ) {
    errors.push("El paso actual no es válido.");
  }

  return [...new Set(errors)];
}

const SECTION_DEFINITIONS = [
  {
    id: "datos-identificacion",
    title: "DATOS DE IDENTIFICACIÓN",
    isComplete: (d, now) =>
      hasText(d.nombreCompleto) &&
      hasText(d.sexo) &&
      /^\d{8}$/.test(toText(d.dni)) &&
      isAdultBirthDate(d.fechaNacimiento, now) &&
      isAdultAge(d.edad) &&
      isAgeConsistentWithBirthDate(d.fechaNacimiento, d.edad, now) &&
      hasText(d.telefono) &&
      hasText(d.ocupacion) &&
      isDate(d.fechaConsulta) &&
      hasText(d.medicoTratante),
  },
  {
    id: "motivo-consulta",
    title: "MOTIVO DE CONSULTA",
    isComplete: (d) =>
      hasText(d.motivoPrincipal) &&
      (toText(d.motivoPrincipal) !== "Otro" || hasText(d.motivoOtro)) &&
      hasText(d.dificultadPeso) &&
      hasText(d.objetivoPaciente),
  },
  {
    id: "historia-peso",
    title: "HISTORIA Y EVOLUCIÓN DEL PESO",
    isComplete: (d) =>
      [
        "pesoMaximo",
        "pesoHabitual",
        "pesoActual",
        "talla",
        "imc",
        "perimetroAbdominal",
      ].every((field) => isDecimal(d[field])) &&
      hasText(d.evolucionPeso) &&
      hasText(d.intentosPrevios) &&
      (toText(d.intentosPrevios) !== "Otro" || hasText(d.intentosOtros)) &&
      hasText(d.tratamientosPreviosRespuesta),
  },
  {
    id: "antecedentes-personales",
    title: "ANTECEDENTES PERSONALES",
    isComplete: (d) =>
      hasArray(d.enfermedadesAntecedentes) &&
      (!includes(d.enfermedadesAntecedentes, "Otros") ||
        hasText(d.enfermedadesOtros)) &&
      hasText(d.cirugiasPrevias) &&
      (toText(d.cirugiasPrevias) !== "Sí" ||
        (hasText(d.cirugiaProcedimiento) && isDate(d.cirugiaFecha))) &&
      hasText(d.hospitalizacionesPrevias) &&
      (toText(d.hospitalizacionesPrevias) !== "Sí" ||
        hasText(d.hospitalizacionMotivo)) &&
      hasText(d.alergiaMedicamentos) &&
      (toText(d.alergiaMedicamentos) !== "Sí" ||
        (hasText(d.alergiaMedicamento) && hasText(d.alergiaReaccion))) &&
      hasText(d.alergiasAlimentarias) &&
      (toText(d.alergiasAlimentarias) !== "Sí" ||
        hasText(d.alergiaAlimentariaCual)) &&
      hasText(d.alergiaLatex) &&
      hasText(d.reaccionesAdversas) &&
      (toText(d.reaccionesAdversas) !== "Sí" ||
        hasText(d.reaccionAdversaMedicamento)) &&
      hasText(d.transfusionesSanguineas),
  },
  {
    id: "antecedentes-familiares",
    title: "ANTECEDENTES FAMILIARES",
    isComplete: (d) =>
      hasArray(d.antecedentesFamiliares) &&
      (!includes(d.antecedentesFamiliares, "Otros") ||
        hasText(d.familiaresOtros)) &&
      hasText(d.familiaresEspecificar),
  },
  {
    id: "gineco-obstetricos",
    title: "ANTECEDENTES GINECO-OBSTÉTRICOS",
    applies: (d) => isFemale(d.sexo),
    isComplete: (d) =>
      [
        "fum",
        "g",
        "p",
        "c",
        "a",
        "metodoAnticonceptivo",
        "embarazoActual",
        "posibilidadEmbarazo",
        "lactancia",
      ].every((field) => hasText(d[field])),
  },
  {
    id: "medicacion-actual",
    title: "MEDICACIÓN ACTUAL Y TRATAMIENTOS PREVIOS",
    isComplete: (d) =>
      hasText(d.medicamentosActuales) &&
      hasText(d.suplementosVitaminas) &&
      hasText(d.agonistasGlp1) &&
      (toText(d.agonistasGlp1) !== "Sí" ||
        (hasText(d.agonistaMedicamento) &&
          hasText(d.agonistaDosis) &&
          hasText(d.agonistaRespuesta))),
  },
  {
    id: "habitos-estilo",
    title: "HÁBITOS Y ESTILO DE VIDA",
    isComplete: (d) =>
      hasText(d.alimentacionHabitual) &&
      hasText(d.comidasDia) &&
      hasText(d.sensacionHambre) &&
      hasText(d.antojosPicoteo) &&
      hasText(d.actividadFisica) &&
      (toText(d.actividadFisica) !== "Regular" ||
        hasText(d.actividadFrecuencia)) &&
      hasText(d.horasSueno) &&
      hasText(d.calidadSueno) &&
      hasText(d.consumoAlcohol),
  },
  {
    id: "sintomas-actuales",
    title: "SÍNTOMAS ACTUALES",
    isComplete: (d) => hasArray(d.sintomasActuales),
  },
  {
    id: "evaluacion-seguridad",
    title: "EVALUACIÓN DE SEGURIDAD PREVIA AL INICIO",
    isComplete: (d) =>
      [
        "carcinomaMedularPersonal",
        "carcinomaMedularFamiliar",
        "men2PersonalFamiliar",
        "enfermedadTiroideaConocida",
        "pancreatitisPrevia",
        "dolorAbdominalRecurrente",
        "litiasisVesicular",
        "colecistitis",
        "cirugiaVesicula",
        "enfermedadHepatica",
        "ictericiaPrevia",
        "gastroparesia",
        "enfermedadGiImportante",
        "enfermedadRenal",
        "deshidratacionReciente",
        "hipoglucemiasPrevias",
        "insulina",
        "sulfonilureas",
        "otrosMedDiabetes",
        "otrosMedPeso",
      ].every((field) => hasText(d[field])),
  },
  {
    id: "evaluacion-clinica",
    title: "EVALUACIÓN CLÍNICA",
    isComplete: (d) =>
      [
        "presionSistolica",
        "presionDiastolica",
        "frecuenciaCardiaca",
        "pesoClinico",
        "tallaClinica",
        "imcClinico",
        "perimetroAbdominalClinico",
      ].every((field) => isDecimal(d[field])) && hasText(d.examenFisico),
  },
  {
    id: "examenes-auxiliares",
    title: "EXÁMENES AUXILIARES",
    isComplete: (d) =>
      isDate(d.fechaLaboratorio) &&
      [
        "glucosaAyunas",
        "hba1c",
        "creatinina",
        "tfge",
        "tgoAst",
        "tgpAlt",
        "colesterolTotal",
        "ldl",
        "hdl",
        "trigliceridos",
        "tsh",
      ].every((field) => hasText(d[field])),
  },
  {
    id: "evaluacion-medica",
    title: "EVALUACIÓN MÉDICA",
    isComplete: (d) =>
      hasText(d.diagnostico1) &&
      hasText(d.comorbilidades) &&
      hasText(d.factoresRiesgo) &&
      hasText(d.observacionesClinicas),
  },
  {
    id: "conducta-plan",
    title: "CONDUCTA Y PLAN",
    isComplete: (d) =>
      hasArray(d.conductaPlan) &&
      (!includes(d.conductaPlan, "Otros") || hasText(d.conductaOtro)) &&
      hasText(d.medicamentoIndicado) &&
      hasText(d.presentacion) &&
      hasText(d.dosisInicial) &&
      isDate(d.fechaInicioTratamiento) &&
      isDate(d.proximoControl),
  },
  {
    id: "constancia-medica",
    title: "CONSTANCIA MÉDICA",
    isComplete: (d) =>
      hasText(d.consentimientoInformado) &&
      isDate(d.consentimientoFecha) &&
      isDate(d.fechaConstancia),
  },
];

/**
 * Devuelve los pasos incompletos con la numeración visible para ese paciente.
 * Así, al omitir gineco-obstetricia para un paciente hombre, el siguiente paso
 * se informa como VI y nunca queda un salto en la interfaz.
 */
function getMissingFinalizationSections(formData, now = new Date()) {
  if (!isPlainObject(formData)) return [];

  const applicableSections = SECTION_DEFINITIONS.filter(
    (section) => !section.applies || section.applies(formData),
  );

  return applicableSections
    .map((section, index) => ({
      id: section.id,
      section: ROMAN_NUMBERS[index],
      title: section.title,
      complete: section.isComplete(formData, now),
    }))
    .filter((section) => !section.complete)
    .map(({ complete, ...section }) => section);
}

module.exports = {
  getPayloadValidationErrors,
  getMissingFinalizationSections,
  isDate,
  calculateAgeFromBirthDate,
  isAdultAge,
  isAdultBirthDate,
  isAgeConsistentWithBirthDate,
  isDecimal,
  isFemale,
};
