const userRepository = require("../repositories/user.repository");
const tratamientoRepository = require("../repositories/tratamiento.repository");
const citaRepository = require("../repositories/cita.repository");
const AppError = require("../errors/AppError");
const {
  getProfessionalNames,
  normalizeProfessionalName,
  resolveLegacyProfessional,
} = require("../helpers/professionalIdentityResolver");

let pendingReconciliation = null;

function idOf(value) {
  return String(value?._id || value || "");
}

function addAlias(aliasesById, professional, previousName) {
  if (normalizeProfessionalName(previousName) === normalizeProfessionalName(professional.nombre)) {
    return;
  }
  const id = idOf(professional);
  const entry = aliasesById.get(id) || {
    professionalId: professional._id,
    rol: professional.rol,
    names: [],
  };
  if (!entry.names.includes(previousName)) entry.names.push(previousName);
  aliasesById.set(id, entry);
}

/**
 * Ordinary reads repair only rows linked to an immutable appointment owner.
 * Editable profile names and aliases never acquire runtime ownership.
 * Name-only adoption requires a reviewed offline migration with
 * allowNameInference=true; no HTTP route accepts this option.
 *
 * A dry run performs no writes and returns counts rather than personal data.
 */
async function runReconciliation({ dryRun = false, allowNameInference = false, approvedLegacyNames = [] } = {}) {
  const offlineNameInference = allowNameInference === true;
  if (approvedLegacyNames.length && !offlineNameInference) {
    throw new AppError("Los nombres históricos requieren una migración interna verificada.", 400);
  }
  const [rows, profiles] = await Promise.all([
    tratamientoRepository.findLegacyProfessionalRows(),
    userRepository.findProfessionalIdentities(),
  ]);
  const professionals = profiles.map((profile) => ({
    ...profile,
    nombresAnteriores: [...(profile.nombresAnteriores || [])],
  }));
  const professionalsById = new Map(professionals.map((profile) => [idOf(profile), profile]));
  const aliasesById = new Map();

  for (const assignment of approvedLegacyNames) {
    const professional = professionalsById.get(idOf(assignment.professionalId));
    const previousName = String(assignment.previousName || "").trim();
    if (!professional || professional.rol !== assignment.rol || !previousName || previousName.length > 160) {
      throw new AppError("La asignación de identidad histórica no es válida.", 400);
    }
    const normalizedName = normalizeProfessionalName(previousName);
    const conflictingOwner = professionals.some((candidate) =>
      idOf(candidate) !== idOf(professional) &&
      candidate.rol === professional.rol &&
      getProfessionalNames(candidate).includes(normalizedName),
    );
    if (conflictingOwner) {
      throw new AppError("El nombre histórico tiene más de un propietario posible.", 409);
    }
    professional.nombresAnteriores.push(previousName);
    addAlias(aliasesById, professional, previousName);
  }

  const citaIds = [...new Set(rows.map((row) => idOf(row.cita)).filter(Boolean))];
  const appointments = citaIds.length
    ? await citaRepository.findProfessionalReferencesByIds(citaIds)
    : [];
  const appointmentsById = new Map(appointments.map((appointment) => [idOf(appointment), appointment]));
  const assignments = [];
  const result = {
    dryRun,
    scanned: rows.length,
    eligible: 0,
    byAppointments: 0,
    byUniqueNames: 0,
    ambiguous: 0,
    unmatched: 0,
    unresolvedAppointments: 0,
    nameOnlySkipped: 0,
    modified: 0,
  };

  for (const treatment of rows) {
    let professional;
    if (treatment.cita) {
      const appointment = appointmentsById.get(idOf(treatment.cita));
      professional = professionalsById.get(idOf(appointment?.profesional));
      if (!professional) {
        result.unresolvedAppointments += 1;
        continue;
      }
      result.byAppointments += 1;
    } else {
      if (!offlineNameInference) {
        result.nameOnlySkipped += 1;
        continue;
      }
      const resolution = resolveLegacyProfessional(treatment, professionals);
      professional = resolution.professional;
      if (!professional) {
        result[resolution.reason] += 1;
        continue;
      }
      result.byUniqueNames += 1;
      addAlias(aliasesById, professional, String(treatment.profesional).trim());
    }
    assignments.push({ treatment, professional });
  }

  result.eligible = assignments.length;
  if (!dryRun) {
    // Aliases are historical metadata, never runtime authorization.
    await userRepository.addPreviousProfessionalNames([...aliasesById.values()]);
    const writeResult = await tratamientoRepository.reconcileProfessionalRows(assignments);
    result.modified = writeResult.modifiedCount || 0;
  }
  return result;
}

function reconciliarIdentidadesProfesionales(options = {}) {
  if (options.dryRun || options.allowNameInference === true || options.approvedLegacyNames?.length) {
    return runReconciliation(options);
  }
  if (!pendingReconciliation) {
    pendingReconciliation = runReconciliation(options).finally(() => {
      pendingReconciliation = null;
    });
  }
  return pendingReconciliation;
}

module.exports = { reconciliarIdentidadesProfesionales };
