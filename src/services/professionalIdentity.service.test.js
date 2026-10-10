const assert = require("node:assert/strict");
const test = require("node:test");
const professionalIdentityService = require("./professionalIdentity.service");
const userRepository = require("../repositories/user.repository");
const tratamientoRepository = require("../repositories/tratamiento.repository");
const citaRepository = require("../repositories/cita.repository");

function mockRepositories(t, { profiles, rows, appointments = [] }) {
  const saved = [
    [userRepository, "findProfessionalIdentities"],
    [userRepository, "addPreviousProfessionalNames"],
    [tratamientoRepository, "findLegacyProfessionalRows"],
    [tratamientoRepository, "reconcileProfessionalRows"],
    [citaRepository, "findProfessionalReferencesByIds"],
  ].map(([target, name]) => [target, name, target[name]]);
  t.after(() => saved.forEach(([target, name, value]) => { target[name] = value; }));
  const writes = { aliases: [], treatments: [] };
  userRepository.findProfessionalIdentities = async () => profiles;
  tratamientoRepository.findLegacyProfessionalRows = async () => rows;
  citaRepository.findProfessionalReferencesByIds = async () => appointments;
  userRepository.addPreviousProfessionalNames = async (aliases) => {
    writes.aliases.push(...aliases);
    return { modifiedCount: aliases.length };
  };
  tratamientoRepository.reconcileProfessionalRows = async (assignments) => {
    writes.treatments.push(...assignments);
    return { modifiedCount: assignments.length };
  };
  return writes;
}

test("dry-run respects roles, whole tokens, suspended names and appointment authority without writing", async (t) => {
  const writes = mockRepositories(t, {
    profiles: [
      { _id: "doctor-a", rol: "doctor", nombre: "Ana Perez Garcia", activo: true },
      { _id: "doctor-b", rol: "doctor", nombre: "Luis Torres", activo: true },
      { _id: "doctor-c", rol: "doctor", nombre: "Luis Torres Soto", activo: false },
      { _id: "cosmiatra-a", rol: "cosmiatra", nombre: "Luz", activo: true },
      { _id: "cosmiatra-b", rol: "cosmiatra", nombre: "Maria Luna", activo: true },
    ],
    rows: [
      { _id: "a", rol: "doctor", profesional: "ÁNA  PÉREZ" },
      { _id: "b", rol: "cosmiatra", profesional: "Ana Perez" },
      { _id: "c", rol: "doctor", profesional: "Ana" },
      { _id: "d", rol: "cosmiatra", profesional: "Luz Rodriguez" },
      { _id: "e", rol: "cosmiatra", profesional: "Maria Luna" },
      { _id: "f", rol: "doctor", profesional: "Nombre incorrecto", cita: "appointment-a" },
      { _id: "g", rol: "doctor", profesional: "Luis Torres", cita: "missing-appointment" },
      { _id: "h", rol: "doctor", profesional: "Luis Torres" },
    ],
    appointments: [{ _id: "appointment-a", profesional: "doctor-a" }],
  });

  const result = await professionalIdentityService.reconciliarIdentidadesProfesionales({ dryRun: true, allowNameInference: true });
  assert.deepEqual(result, {
    dryRun: true,
    scanned: 8,
    eligible: 3,
    byAppointments: 1,
    byUniqueNames: 2,
    ambiguous: 1,
    unmatched: 3,
    unresolvedAppointments: 1,
    nameOnlySkipped: 0,
    modified: 0,
  });
  assert.deepEqual(writes, { aliases: [], treatments: [] });
});

test("an explicitly verified old name is saved as an alias and recovers a one-token profile safely", async (t) => {
  const writes = mockRepositories(t, {
    profiles: [
      { _id: "cosmiatra-a", rol: "cosmiatra", nombre: "Luz" },
      { _id: "doctor-a", rol: "doctor", nombre: "Luz Rodriguez" },
    ],
    rows: [{ _id: "treatment-a", rol: "cosmiatra", profesional: "Luz Rodriguez" }],
  });
  const approvedLegacyNames = [{ professionalId: "cosmiatra-a", rol: "cosmiatra", previousName: "Luz Rodriguez" }];
  const dryRun = await professionalIdentityService.reconciliarIdentidadesProfesionales({ dryRun: true, allowNameInference: true, approvedLegacyNames });
  assert.equal(dryRun.eligible, 1);
  assert.equal(writes.treatments.length, 0);

  const result = await professionalIdentityService.reconciliarIdentidadesProfesionales({ allowNameInference: true, approvedLegacyNames });
  assert.equal(result.modified, 1);
  assert.deepEqual(writes.aliases, [{ professionalId: "cosmiatra-a", rol: "cosmiatra", names: ["Luz Rodriguez"] }]);
  assert.equal(writes.treatments[0].professional._id, "cosmiatra-a");

  // The repository only returns still-unowned rows, making a second run a no-op.
  tratamientoRepository.findLegacyProfessionalRows = async () => [];
  const secondRun = await professionalIdentityService.reconciliarIdentidadesProfesionales();
  assert.equal(secondRun.scanned, 0);
  assert.equal(secondRun.modified, 0);
});

test("rejects explicit alias assignments to another role or a competing account", async (t) => {
  const writes = mockRepositories(t, {
    profiles: [
      { _id: "cosmiatra-a", rol: "cosmiatra", nombre: "Luz" },
      { _id: "cosmiatra-b", rol: "cosmiatra", nombre: "Maria Luna", nombresAnteriores: ["Luz Rodriguez"] },
    ],
    rows: [],
  });
  await assert.rejects(
    professionalIdentityService.reconciliarIdentidadesProfesionales({ allowNameInference: true, approvedLegacyNames: [{ professionalId: "cosmiatra-a", rol: "doctor", previousName: "Luz Rodriguez" }] }),
    (error) => error.statusCode === 400,
  );
  await assert.rejects(
    professionalIdentityService.reconciliarIdentidadesProfesionales({ allowNameInference: true, approvedLegacyNames: [{ professionalId: "cosmiatra-a", rol: "cosmiatra", previousName: "Luz Rodriguez" }] }),
    (error) => error.statusCode === 409,
  );
  assert.deepEqual(writes, { aliases: [], treatments: [] });
});

test("a reviewed offline migration can resolve a recorded historical alias", async (t) => {
  const writes = mockRepositories(t, {
    profiles: [{ _id: "doctor-a", rol: "doctor", nombre: "Dra. Identidad Actual", nombresAnteriores: ["Ana Perez"] }],
    rows: [{ _id: "treatment-a", rol: "doctor", profesional: "Ana Perez" }],
  });
  const result = await professionalIdentityService.reconciliarIdentidadesProfesionales({ allowNameInference: true });
  assert.equal(result.modified, 1);
  assert.equal(writes.treatments[0].professional.nombre, "Dra. Identidad Actual");
});

test("ordinary reads cannot acquire records through editable names or forged prior aliases", async (t) => {
  const writes = mockRepositories(t, {
    profiles: [
      { _id: "doctor-attacker", rol: "doctor", nombre: "Nombre Ajeno Actual", nombresAnteriores: ["Nombre Ajeno Anterior"] },
      { _id: "doctor-owner", rol: "doctor", nombre: "Propietario Real" },
    ],
    rows: [
      { _id: "unlinked-current", rol: "doctor", profesional: "Nombre Ajeno Actual" },
      { _id: "unlinked-alias", rol: "doctor", profesional: "Nombre Ajeno Anterior" },
      { _id: "linked-owner", rol: "doctor", profesional: "Nombre Ajeno Actual", cita: "appointment-owner" },
    ],
    appointments: [{ _id: "appointment-owner", profesional: "doctor-owner" }],
  });
  const result = await professionalIdentityService.reconciliarIdentidadesProfesionales();
  assert.equal(result.eligible, 1);
  assert.equal(result.byAppointments, 1);
  assert.equal(result.byUniqueNames, 0);
  assert.equal(result.nameOnlySkipped, 2);
  assert.deepEqual(writes.aliases, []);
  assert.deepEqual(writes.treatments.map(({ treatment, professional }) => ({
    treatment: treatment._id, owner: professional._id,
  })), [{ treatment: "linked-owner", owner: "doctor-owner" }]);
});

test("ordinary calls reject explicit legacy aliases without the offline migration flag", async () => {
  await assert.rejects(
    professionalIdentityService.reconciliarIdentidadesProfesionales({
      approvedLegacyNames: [{ professionalId: "doctor-attacker", rol: "doctor", previousName: "Nombre Ajeno" }],
    }),
    (error) => error.statusCode === 400,
  );
});
