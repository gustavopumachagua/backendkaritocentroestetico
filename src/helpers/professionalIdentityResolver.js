const { PROFESSIONAL_ROLES } = require("../constants");

function normalizeProfessionalName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}

function getProfessionalNames(professional) {
  return [...new Set([
    professional?.nombre,
    ...(Array.isArray(professional?.nombresAnteriores)
      ? professional.nombresAnteriores
      : []),
  ].map(normalizeProfessionalName).filter(Boolean))];
}

function matchesLegacyName(legacyName, candidateName) {
  if (legacyName === candidateName) return true;

  // One shared first name cannot identify an account. Older full-name
  // extensions/shortenings require at least two whole, ordered tokens.
  const shorterName = legacyName.length < candidateName.length
    ? legacyName
    : candidateName;
  return shorterName.split(" ").length >= 2 &&
    (legacyName.startsWith(`${candidateName} `) ||
      candidateName.startsWith(`${legacyName} `));
}

function resolveLegacyProfessional(record, professionals) {
  const role = String(record?.rol || "").trim().toLowerCase();
  const name = normalizeProfessionalName(record?.profesional);
  if (!PROFESSIONAL_ROLES.includes(role) || !name) {
    return { professional: null, reason: "unmatched" };
  }

  // Include suspended accounts in the candidate set: suspension does not
  // transfer their historical records to another person with a similar name.
  const candidates = professionals.filter((professional) =>
    professional.rol === role &&
    getProfessionalNames(professional).some((candidateName) =>
      matchesLegacyName(name, candidateName),
    ),
  );

  return candidates.length === 1
    ? { professional: candidates[0], reason: "uniqueName" }
    : { professional: null, reason: candidates.length > 1 ? "ambiguous" : "unmatched" };
}

module.exports = {
  normalizeProfessionalName,
  getProfessionalNames,
  resolveLegacyProfessional,
};
