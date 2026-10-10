const test = require("node:test");
const assert = require("node:assert/strict");
const { collectMigrationCandidates, inspectCandidate, applyMigration, withRetry, selectEntries, MANIFEST_VERSION } = require("./mediaMigration.service");
const { parseArguments, manifestPath, createRepository } = require("../../scripts/migrate-protected-media");

const DOCTOR = "507f1f77bcf86cd799439011";
const OTHER = "507f1f77bcf86cd799439012";
const CLOUD = "test-cloud";
const PUBLIC_ID = "firmas/test-signature";
const ASSET_ID = "test-asset-id";
const url = (publicId) => `https://res.cloudinary.com/${CLOUD}/image/upload/v123/${publicId}.webp`;
const asset = (type = "upload") => ({ asset_id: ASSET_ID, public_id: PUBLIC_ID, resource_type: "image", type, format: "webp", version: 123, bytes: 1024, width: 400, height: 200 });

function candidate() {
  return {
    publicId: PUBLIC_ID, sourceType: "upload", expectedAssetId: "",
    references: [{ kind: "signature", documentType: "user", documentId: DOCTOR, ownerId: DOCTOR, assetField: "firmaDigitalAsset", publicIdField: "firmaDigitalPublicId", urlField: "firmaDigital", previousAsset: null, sourcePublicId: PUBLIC_ID, sourceUrl: url(PUBLIC_ID), publicIdSnapshot: PUBLIC_ID, urlSnapshot: url(PUBLIC_ID) }],
  };
}

async function setup() {
  const calls = [];
  let privateResource = false;
  let updated = false;
  const provider = {
    async inspect(publicId, type) {
      calls.push(["inspect", publicId, type]);
      if ((type === "upload") === privateResource) throw { http_code: 404 };
      return asset(type);
    },
    async rename(from, to, options) {
      calls.push(["rename", from, to, options]);
      privateResource = true;
      return asset("authenticated");
    },
  };
  const entry = await inspectCandidate(candidate(), provider);
  calls.length = 0;
  const manifest = { version: MANIFEST_VERSION, entries: [entry] };
  const repository = { matchesSnapshot: async () => true, updateReference: async () => { updated = true; return true; }, hasAsset: async () => updated };
  const checkpointStates = [];
  const checkpoint = async (value) => checkpointStates.push(value.entries[0].state);
  return { calls, provider, entry, manifest, repository, checkpointStates, checkpoint };
}

test("inventory binds signature and histories by immutable account, not display names", () => {
  const result = collectMigrationCandidates({ cloudName: CLOUD, users: [{ _id: DOCTOR, rol: "doctor", firmaDigital: url(PUBLIC_ID), firmaDigitalPublicId: PUBLIC_ID }], histories: [{ _id: OTHER, medico: DOCTOR, firmaMedico: { url: url(PUBLIC_ID) } }], treatments: [] });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].references.length, 2);
  assert.deepEqual(result.exclusions, []);
});

test("inventory rejects cross-account resources, foreign URLs, unknown owners and private delivery needing review", () => {
  const result = collectMigrationCandidates({ cloudName: CLOUD, users: [{ _id: DOCTOR, rol: "doctor", firmaDigital: url(PUBLIC_ID), firmaDigitalPublicId: PUBLIC_ID }, { _id: OTHER, rol: "doctor", firmaDigital: url(PUBLIC_ID) }], histories: [{ _id: "history", medico: "unknown", firmaMedico: { url: url(PUBLIC_ID) } }], treatments: [{ _id: "treatment", profesionalId: DOCTOR, rol: "doctor", imagenes: [{ url: "https://attacker.example/image.webp" }] }] });
  assert.equal(result.candidates.length, 0);
  assert.deepEqual(result.exclusions.map((item) => item.reason).sort(), ["asset_unverified", "conflicting_ownership_or_asset", "ownership_unverified"]);
});

test("inventory retains public replaced assets without migrating the current protected signature again", () => {
  const result = collectMigrationCandidates({ cloudName: CLOUD, users: [{ _id: DOCTOR, rol: "doctor", firmaDigitalAsset: { ...asset("authenticated"), public_id: "firmas/current-private" }, retiredMediaAssets: [{ kind: "signature", asset: asset(), url: url(PUBLIC_ID) }] }], histories: [], treatments: [] });
  assert.equal(result.candidates.length, 1);
  const reference = result.candidates[0].references[0];
  assert.equal(reference.ownerId, DOCTOR);
  assert.equal(reference.assetField, "retiredMediaAssets.0.asset");
  assert.equal(reference.urlField, "retiredMediaAssets.0.url");
  assert.equal(reference.publicIdField, undefined);
});

test("inspection stores only minimal metadata and verifies resource identity", async () => {
  const entry = await inspectCandidate(candidate(), { inspect: async () => ({ ...asset(), secure_url: "must-not-persist", context: { patient: "private" } }) });
  assert.deepEqual(entry.originalAsset, asset());
  await assert.rejects(inspectCandidate(candidate(), { inspect: async () => ({ ...asset(), public_id: "firmas/other" }) }), /asset_integrity_mismatch/);
  await assert.rejects(inspectCandidate(candidate(), { inspect: async () => ({ ...asset(), format: "svg" }) }), /asset_integrity_mismatch/);
});

test("CLI is dry-run by default and rejects unconfirmed or unbounded apply", () => {
  assert.equal(parseArguments([]).apply, false);
  assert.throws(() => parseArguments(["--apply", "--limit", "1"]), /apply_requires_confirmation_and_targets/);
  assert.throws(() => parseArguments(["--apply", "--confirm-private-migration"]), /apply_requires_confirmation_and_targets/);
  assert.throws(() => parseArguments(["--limit", "26"]), /invalid_limit/);
  assert.equal(parseArguments(["--apply", "--confirm-private-migration", "--limit", "1"]).apply, true);
  assert.throws(() => manifestPath("package.json"), /manifest_must_use_private_state_directory/);
  assert.throws(() => manifestPath("migration-state/../../elsewhere.json"), /manifest_must_use_private_state_directory/);
});

test("migration requires explicit confirmation and verified targets before any provider call", async () => {
  const context = await setup();
  await assert.rejects(applyMigration({ ...context, limit: 1 }), /confirmation_required/);
  assert.throws(() => selectEntries(context.manifest, { assetIds: ["unknown"] }), /target_not_in_manifest/);
  assert.deepEqual(context.calls, []);
});

test("pilot changes delivery type only, invalidates old URLs and checkpoints guarded references", async () => {
  const context = await setup();
  const summary = await applyMigration({ ...context, confirmed: true, assetIds: [ASSET_ID] });
  assert.deepEqual(summary, { selected: 1, completed: 1, failed: 0 });
  assert.deepEqual(context.calls.find(([method]) => method === "rename"), ["rename", PUBLIC_ID, PUBLIC_ID, { resource_type: "image", type: "upload", to_type: "authenticated", overwrite: false, invalidate: true }]);
  assert.equal(context.entry.protectedAsset.asset_id, ASSET_ID);
  assert.equal(context.entry.state, "completed");
  assert.ok(context.checkpointStates.includes("private_pending_references"));
});

test("a changed binding blocks the resource rename even on a repeated preflight", async () => {
  const context = await setup();
  context.repository.matchesSnapshot = async () => false;
  const first = await applyMigration({ ...context, confirmed: true, limit: 1 });
  assert.equal(first.failed, 1);
  const second = await applyMigration({ ...context, confirmed: true, limit: 1 });
  assert.equal(second.failed, 1);
  assert.equal(context.calls.some(([method]) => method === "rename"), false);
  assert.equal(context.entry.error, "reference_changed_before_migration");
});

test("partial database failure leaves media private and resume never duplicates or republishes it", async () => {
  const context = await setup();
  context.repository.updateReference = async () => { throw new Error("sensitive url https://private.example"); };
  const first = await applyMigration({ ...context, confirmed: true, limit: 1 });
  assert.equal(first.failed, 1);
  assert.equal(context.entry.error, "provider_or_database_error");
  assert.equal(context.entry.protectedAsset.type, "authenticated");
  context.repository.updateReference = async () => true;
  const second = await applyMigration({ ...context, confirmed: true, limit: 1 });
  assert.equal(second.completed, 1);
  assert.equal(context.calls.filter(([method]) => method === "rename").length, 1);
  assert.equal(context.entry.state, "completed");
});

test("rename returning a different asset ID cannot update any document", async () => {
  const context = await setup();
  let writes = 0;
  context.provider.rename = async () => ({ ...asset("authenticated"), asset_id: "different" });
  context.repository.updateReference = async () => { writes += 1; return true; };
  const result = await applyMigration({ ...context, confirmed: true, limit: 1 });
  assert.equal(result.failed, 1);
  assert.equal(writes, 0);
  assert.equal(context.entry.error, "asset_integrity_mismatch");
});

test("renaming must preserve content metadata before updating references", async () => {
  const context = await setup();
  let writes = 0;
  context.provider.rename = async () => ({ ...asset("authenticated"), bytes: 2048 });
  context.repository.updateReference = async () => { writes += 1; return true; };
  const result = await applyMigration({ ...context, confirmed: true, limit: 1 });
  assert.equal(result.failed, 1);
  assert.equal(writes, 0);
  assert.equal(context.entry.error, "asset_content_mismatch");
});

test("cloud content modified after inventory is detected before rename", async () => {
  const context = await setup();
  context.provider.inspect = async () => ({ ...asset(), width: 800 });
  const result = await applyMigration({ ...context, confirmed: true, limit: 1 });
  assert.equal(result.failed, 1);
  assert.equal(context.calls.some(([method]) => method === "rename"), false);
  assert.equal(context.entry.error, "asset_content_mismatch");
});

test("retry is bounded to transient rate-limit/server errors, not authorization failures", async () => {
  let calls = 0;
  const waits = [];
  const result = await withRetry(async () => { if (++calls < 3) throw { http_code: 429 }; return "ok"; }, { wait: async (delay) => waits.push(delay) });
  assert.equal(result, "ok");
  assert.deepEqual(waits, [250, 500]);
  calls = 0;
  await assert.rejects(withRetry(async () => { calls += 1; throw Object.assign(new Error("forbidden"), { http_code: 403 }); }, { wait: async () => {} }), /forbidden/);
  assert.equal(calls, 1);
});

test("repository metadata update includes ownership and old-value CAS, not full document replacements", async () => {
  const calls = [];
  const models = { history: { updateOne: async (...args) => { calls.push(args); return { matchedCount: 1 }; } } };
  const reference = { ...candidate().references[0], documentType: "history", assetField: "firmaMedico.asset", publicIdField: undefined, urlField: "firmaMedico.url" };
  const updated = await createRepository(models).updateReference(reference, asset("authenticated"));
  assert.equal(updated, true);
  const [filter, update] = calls[0];
  assert.equal(filter.medico, DOCTOR);
  assert.equal(filter["firmaMedico.asset"], null);
  assert.equal(filter["firmaMedico.url"], url(PUBLIC_ID));
  assert.deepEqual(update, { $set: { "firmaMedico.asset": asset("authenticated") } });
});

test("retired-asset CAS protects the archived entry and never overwrites the current signature", async () => {
  const calls = [];
  const models = { user: { updateOne: async (...args) => { calls.push(args); return { matchedCount: 1 }; } } };
  const reference = { ...candidate().references[0], retiredIndex: 0, retiredId: "archive-id", assetField: "retiredMediaAssets.0.asset", publicIdField: undefined, urlField: "retiredMediaAssets.0.url", previousAsset: asset() };
  await createRepository(models).updateReference(reference, asset("authenticated"));
  const [filter, update] = calls[0];
  assert.equal(filter._id, DOCTOR);
  assert.equal(filter["retiredMediaAssets.0.kind"], "signature");
  assert.equal(filter["retiredMediaAssets.0._id"], "archive-id");
  assert.deepEqual(filter["retiredMediaAssets.0.asset"], asset());
  assert.deepEqual(update, { $set: { "retiredMediaAssets.0.asset": asset("authenticated") } });
  assert.equal(update.$set.firmaDigitalAsset, undefined);
});
