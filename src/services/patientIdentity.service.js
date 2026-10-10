const mongoose = require("mongoose");
const repository = require("../repositories/patientIdentity.repository");
const AppError = require("../errors/AppError");
const {
  text, getId, normalizeName, normalizeDni, normalizePhone, normalizeSex, evidence,
  conflicts, sameVerifiedPatient, selectPatientRecords,
} = require("../helpers/patientIdentity");

function getPath(record, path) {
  return path.split(".").reduce((value, key) => value?.[key], record);
}

function previousNames(names, currentName) {
  const normalizedCurrent = normalizeName(currentName);
  return [...new Map(names.filter((name) => text(name) && normalizeName(name) !== normalizedCurrent)
    .map((name) => [normalizeName(name), text(name)])).values()].slice(-30);
}

async function rollback(operations = []) {
  const results = await Promise.allSettled(operations.slice().reverse().map(repository.restoreMutation));
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

/** One patient identity spans visits, professionals, billing and documents. */
async function synchronizePatientName({
  identity, existing, nombreNuevo, formData = {}, dryRun = false,
  approvedPreviousNames = [], approvedAppointmentIds = [], allowLegacyAliasMigration = false,
}) {
  // Explicit old-name mappings and appointment ids are reserved for an internal repair.
  // No HTTP controller accepts these options or browser-provided aliases.
  if (!Array.isArray(approvedPreviousNames) || approvedPreviousNames.length > 30 ||
      approvedPreviousNames.some((name) => typeof name !== "string" || !text(name) || text(name).length > 160)) {
    throw new AppError("Los nombres anteriores revisados no son válidos.", 400);
  }
  if (!Array.isArray(approvedAppointmentIds) || approvedAppointmentIds.length > 100 ||
      Array.from(approvedAppointmentIds).some((id) => typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id))) {
    throw new AppError("Las citas revisadas no son válidas.", 400);
  }
  const reviewedAppointmentIds = [...new Set(approvedAppointmentIds.map((id) => id.toLowerCase()))];
  if ((approvedPreviousNames.length || reviewedAppointmentIds.length) && allowLegacyAliasMigration !== true) {
    throw new AppError("La recuperación de nombres anteriores requiere una migración interna revisada.", 400);
  }
  const sourceEvidence = evidence(identity.tratamiento || {}, "tratamiento");
  const existingEvidence = evidence(existing || {}, "historia");
  if ((approvedPreviousNames.length || reviewedAppointmentIds.length) && !sourceEvidence.phone && !sourceEvidence.dni &&
      !existingEvidence.phone && !existingEvidence.dni) {
    throw new AppError("La migración requiere contacto o DNI persistidos del paciente original.", 409);
  }
  const sourceIds = [identity.cita?.pacienteId, identity.tratamiento?.pacienteId, existing?.pacienteId]
    .map(getId).filter(Boolean);
  if (new Set(sourceIds).size > 1) {
    throw new AppError("Los registros seleccionados pertenecen a pacientes distintos.", 409);
  }
  const pacienteId = sourceIds[0] || getId(identity.tratamiento) || getId(identity.cita);
  if (!pacienteId) throw new AppError("Se requiere una cita o tratamiento para identificar al paciente.", 400);
  const names = [...new Set([
    identity.patientName, identity.tratamiento?.nombre, existing?.paciente?.nombre,
    ...(identity.tratamiento?.pacienteNombresAnteriores || []), ...(existing?.pacienteNombresAnteriores || []),
    ...approvedPreviousNames,
  ].map(text).filter(Boolean))];
  const records = await repository.findCandidates({
    names, pacienteId,
    citaIds: [getId(identity.cita)].filter(Boolean),
    treatmentIds: [getId(identity.tratamiento)].filter(Boolean),
  });
  // Prefer raw repository projections to hydrated documents with schema
  // defaults: optimistic guards must represent what is actually persisted.
  const rawIdentity = {
    ...identity,
    cita: records.citas.find((record) => getId(record) === getId(identity.cita)) || identity.cita,
    tratamiento: records.tratamientos.find((record) => getId(record) === getId(identity.tratamiento)) || identity.tratamiento,
  };
  const rawExisting = records.historias.find((record) => getId(record) === getId(existing)) || existing;
  const knownNames = new Set(names.map(normalizeName));
  const candidateAppointments = new Map(records.citas.map((record) => [getId(record), record]));
  for (const id of reviewedAppointmentIds) {
    const record = candidateAppointments.get(id);
    if (!record || !knownNames.has(normalizeName(record.cliente)) ||
        (record.pacienteId && getId(record.pacienteId) !== pacienteId)) {
      throw new AppError("Una de las citas revisadas no corresponde al paciente seleccionado.", 409);
    }
  }
  const selected = selectPatientRecords({
    identity: rawIdentity, existing: rawExisting, records, pacienteId, names, submittedDni: formData.dni,
    approvedAppointmentIds: reviewedAppointmentIds,
  });
  const aliases = previousNames([
    ...names, ...selected.tratamientos.flatMap((record) => [record.nombre, ...(record.pacienteNombresAnteriores || [])]),
    ...selected.historias.flatMap((record) => [record.paciente?.nombre, ...(record.pacienteNombresAnteriores || [])]),
  ], nombreNuevo);
  const dni = normalizeDni(formData.dni) || normalizeDni(identity.tratamiento?.pacienteDni) || normalizeDni(existing?.paciente?.dni);
  const definitions = [
    ["cita", selected.citas, { cliente: nombreNuevo, pacienteId }],
    ["tratamiento", selected.tratamientos, {
      nombre: nombreNuevo, pacienteId, pacienteNombresAnteriores: aliases, ...(dni ? { pacienteDni: dni } : {}),
    }],
    ["pago", selected.pagos, { cliente: nombreNuevo, pacienteId }],
    ["historia", selected.historias, {
      "paciente.nombre": nombreNuevo, "datosFormulario.nombreCompleto": nombreNuevo,
      pacienteId, pacienteNombresAnteriores: aliases,
    }],
  ];
  const evidencePaths = {
    cita: ["profesional", "rol", "fecha", "servicio", "estado"],
    tratamiento: ["celular", "pacienteDni", "sexo", "cita", "profesionalId", "rol", "fecha", "servicio"],
    pago: ["cita"],
    historia: ["paciente.celular", "paciente.dni", "paciente.sexo", "datosFormulario.telefono", "datosFormulario.dni", "cita", "tratamiento", "medico"],
  };
  const professionalIds = [...new Set([
    ...selected.citas.map((record) => getId(record.profesional)),
    ...selected.tratamientos.map((record) => getId(record.profesionalId)),
    ...selected.historias.map((record) => getId(record.medico)),
  ].filter(Boolean))];
  const metadata = {
    pacienteId, nombre: nombreNuevo, nombreAnterior: text(identity.patientName), aliases, professionalIds,
    excludedAppointmentsCount: selected.excludedCitas.length,
  };
  const planned = definitions.flatMap(([type, documents, next]) => documents.flatMap((record) => {
    const previous = Object.fromEntries(Object.keys(next).map((path) => [path, getPath(record, path)]));
    if (Object.entries(next).every(([path, value]) => JSON.stringify(previous[path]) === JSON.stringify(value))) return [];
    const guard = Object.fromEntries(evidencePaths[type].map((path) => [path, getPath(record, path)]));
    return [{ type, id: getId(record), previous, next, guard }];
  }));
  if (dryRun) return {
    ...metadata, changed: planned.length > 0,
    counts: Object.fromEntries(definitions.map(([type]) => [type, planned.filter((operation) => operation.type === type).length])),
  };
  const operations = [];
  const updated = { citas: [], tratamientos: [], pagos: [], historias: [] };
  const plural = { cita: "citas", tratamiento: "tratamientos", pago: "pagos", historia: "historias" };
  try {
    for (const operation of planned) {
      const saved = await repository.applyMutation(operation);
      if (!saved) throw new AppError("El paciente fue actualizado en otra sesión. Vuelve a abrir su formulario.", 409);
      operations.push(operation);
      updated[plural[operation.type]].push(saved);
    }
  } catch (error) {
    await rollback(operations);
    throw error;
  }
  return {
    ...metadata, changed: operations.length > 0, operations,
    cita: updated.citas.find((record) => getId(record) === getId(identity.cita)) || null,
    tratamiento: updated.tratamientos.find((record) => getId(record) === getId(identity.tratamiento)) || null,
    ...updated,
  };
}

/** Never trust a browser-supplied patient id; reuse only persisted identity. */
async function resolvePatientForRegistration({ nombre, celular, sexo, dni, cita, existing }) {
  const current = cita || existing;
  if (current?.pacienteId) return {
    pacienteId: getId(current.pacienteId), nombre: text(current.cliente || current.nombre || nombre),
  };
  const sourceName = text(current?.cliente || current?.nombre || nombre);
  const records = await repository.findCandidates({ names: [sourceName] });
  const contact = { phone: normalizePhone(celular || existing?.celular), dni: normalizeDni(dni), sex: normalizeSex(sexo || existing?.sexo) };
  // A name-only reservation remains unverified. Its first treatment or
  // clinical form assigns an identity from verified contact and source ids.
  if (!contact.phone && !contact.dni) return { pacienteId: undefined, nombre: sourceName };
  const named = [
    ...records.tratamientos.map((record) => ({ record, data: evidence(record, "tratamiento") })),
    ...records.historias.map((record) => ({ record, data: evidence(record, "historia") })),
  ].filter(({ record, data }) => [data.name, ...(record.pacienteNombresAnteriores || [])]
    .some((name) => normalizeName(name) === normalizeName(sourceName)));
  const verified = named.filter(({ record, data }) => record.pacienteId && !conflicts(contact, data) &&
    sameVerifiedPatient(contact, data));
  const ids = [...new Set(verified.map(({ record }) => getId(record.pacienteId)))];
  if (ids.length > 1) {
    throw new AppError("El contacto coincide con más de un cliente. Verifica su identidad antes de registrar la atención.", 409);
  }
  if (ids.length === 1) return { pacienteId: ids[0], nombre: text(verified[0].data.name) };
  return { pacienteId: getId(current) || new mongoose.Types.ObjectId().toString(), nombre: sourceName };
}

module.exports = { synchronizePatientName, rollback, resolvePatientForRegistration };
