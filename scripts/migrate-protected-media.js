#!/usr/bin/env node
/* Preparing/importing this module never loads credentials or connects services. */
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { constants } = require("node:fs");
const { MANIFEST_VERSION, MAX_BATCH_SIZE, MediaMigrationError, collectMigrationCandidates, inspectCandidate, applyMigration, sameAsset } = require("../src/services/mediaMigration.service");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const STATE_DIRECTORY = path.join(PROJECT_ROOT, "migration-state");

function parseArguments(argv) {
  const options = { apply: false, confirmed: false, assetIds: [], limit: undefined, manifest: "migration-state/protected-media.json" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") options.help = true;
    else if (argument === "--apply") options.apply = true;
    else if (argument === "--confirm-private-migration") options.confirmed = true;
    else if (["--limit", "--asset-id", "--manifest"].includes(argument)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new MediaMigrationError("missing_argument_value");
      if (argument === "--limit") options.limit = Number(value);
      if (argument === "--asset-id") options.assetIds.push(value);
      if (argument === "--manifest") options.manifest = value;
    } else throw new MediaMigrationError("unknown_argument");
  }
  if (options.help) return options;
  if (options.limit != null && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > MAX_BATCH_SIZE)) throw new MediaMigrationError("invalid_limit");
  if (options.apply && (!options.confirmed || (!options.assetIds.length && options.limit !== 1))) throw new MediaMigrationError("apply_requires_confirmation_and_targets");
  if (!options.apply && (options.confirmed || options.assetIds.length)) throw new MediaMigrationError("targets_require_apply");
  if (options.assetIds.length > MAX_BATCH_SIZE) throw new MediaMigrationError("invalid_target_batch");
  return options;
}

function manifestPath(value) {
  const resolved = path.resolve(PROJECT_ROOT, value);
  if (path.dirname(resolved) !== STATE_DIRECTORY || !/^[a-zA-Z0-9_-]+\.json$/.test(path.basename(resolved))) throw new MediaMigrationError("manifest_must_use_private_state_directory");
  return resolved;
}

async function secureDirectory() {
  await fs.mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(STATE_DIRECTORY);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new MediaMigrationError("unsafe_state_directory");
}

async function readManifest(filePath) {
  const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || (stat.mode & 0o077) || stat.size > 20 * 1024 * 1024) throw new MediaMigrationError("unsafe_manifest_file");
    return JSON.parse(await handle.readFile("utf8"));
  } finally { await handle.close(); }
}

async function writeManifest(filePath, manifest, { create = false } = {}) {
  await secureDirectory();
  if (!create) await readManifest(filePath);
  else {
    try { await fs.lstat(filePath); throw new MediaMigrationError("manifest_exists_use_new_name_or_resume"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  const handle = await fs.open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally { await handle.close(); }
  if (create) {
    // link is exclusive: a racing process cannot silently replace a manifest.
    await fs.link(temporaryPath, filePath);
    await fs.unlink(temporaryPath);
  } else await fs.rename(temporaryPath, filePath);
}

function field(document, key) {
  return key.split(".").reduce((value, segment) => value?.[segment], document);
}

function createRepository(models) {
  const modelFor = (reference) => models[reference.documentType];
  async function current(reference) {
    const projection = reference.documentType === "treatment" ? "imagenes profesionalId" : reference.retiredIndex != null ? "_id rol +retiredMediaAssets" : `${reference.assetField} ${reference.urlField} ${reference.publicIdField || ""} medico`;
    return modelFor(reference).findById(reference.documentId).select(projection).lean();
  }
  function guard(reference) {
    const filter = { _id: reference.documentId, [reference.urlField]: reference.urlSnapshot };
    if (reference.publicIdField) filter[reference.publicIdField] = reference.publicIdSnapshot;
    if (reference.previousAsset == null) filter[reference.assetField] = null;
    else filter[reference.assetField] = reference.previousAsset;
    if (reference.retiredIndex != null) {
      filter[`retiredMediaAssets.${reference.retiredIndex}.kind`] = reference.kind;
      if (reference.retiredId) filter[`retiredMediaAssets.${reference.retiredIndex}._id`] = reference.retiredId;
    }
    if (reference.documentType === "history") filter.medico = reference.ownerId;
    if (reference.documentType === "treatment") {
      filter.profesionalId = reference.ownerId;
      filter[`imagenes.${reference.imageIndex}._id`] = reference.imageId || null;
    }
    return filter;
  }
  return {
    async matchesSnapshot(reference) {
      const document = await current(reference);
      if (!document || String(document._id) !== reference.documentId) return false;
      if (reference.retiredIndex != null && (document.retiredMediaAssets?.[reference.retiredIndex]?.kind !== reference.kind || (reference.retiredId && String(document.retiredMediaAssets?.[reference.retiredIndex]?._id || "") !== reference.retiredId))) return false;
      if (reference.documentType === "history" && String(document.medico) !== reference.ownerId) return false;
      if (reference.documentType === "treatment" && (String(document.profesionalId) !== reference.ownerId || String(document.imagenes?.[reference.imageIndex]?._id || "") !== reference.imageId)) return false;
      return (field(document, reference.urlField) || "") === reference.sourceUrl && (!reference.publicIdField || (field(document, reference.publicIdField) || "") === reference.sourcePublicId) && sameAsset(field(document, reference.assetField), reference.previousAsset);
    },
    async updateReference(reference, asset) {
      const result = await modelFor(reference).updateOne(guard(reference), { $set: { [reference.assetField]: asset } }, { runValidators: true });
      return result.matchedCount === 1;
    },
    async hasAsset(reference, asset) {
      const document = await current(reference);
      return Boolean(document && sameAsset(field(document, reference.assetField), asset));
    },
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log("Dry-run: node scripts/migrate-protected-media.js --limit 1 --manifest migration-state/pilot.json\nApply only after separate authorization: add --apply --confirm-private-migration --asset-id <verified asset_id> (or --limit 1).\nAt most 25 explicit targets. Reuse the same manifest to resume. No deletions or public rollback.");
    return;
  }
  const target = manifestPath(options.manifest);
  // Credentials are loaded only when an operator actually executes this CLI.
  require("dotenv").config({ path: path.join(PROJECT_ROOT, ".env"), quiet: true });
  const required = ["MONGO_URI", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
  if (required.some((name) => !String(process.env[name] || "").trim())) throw new MediaMigrationError("missing_runtime_configuration");
  const mongoose = require("mongoose");
  const cloudinary = require("../src/config/cloudinary");
  const models = { user: require("../src/models/User.model"), history: require("../src/models/HistoriaClinica.model"), treatment: require("../src/models/Tratamiento.model") };
  const provider = {
    inspect: (publicId, type) => cloudinary.api.resource(publicId, { resource_type: "image", type }),
    rename: (from, to, configuration) => cloudinary.uploader.rename(from, to, configuration),
  };
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
    const origin = crypto.createHash("sha256").update(`${process.env.CLOUDINARY_CLOUD_NAME}:${mongoose.connection.host}:${mongoose.connection.name}`).digest("hex");
    if (options.apply) {
      await secureDirectory();
      const lockPath = `${target}.lock`;
      const lock = await fs.open(lockPath, "wx", 0o600);
      try {
        const manifest = await readManifest(target);
        if (manifest.origin !== origin) throw new MediaMigrationError("manifest_environment_mismatch");
        const summary = await applyMigration({ manifest, assetIds: options.assetIds, limit: options.limit, confirmed: options.confirmed, provider, repository: createRepository(models), checkpoint: (value) => writeManifest(target, value) });
        console.log(JSON.stringify({ mode: "apply", ...summary }));
        if (summary.failed) process.exitCode = 1;
      } finally {
        await lock.close();
        await fs.unlink(lockPath);
      }
    } else {
      const [users, histories, treatments] = await Promise.all([
        models.user.find().select("_id rol avatar avatarPublicId avatarAsset firmaDigital firmaDigitalPublicId firmaDigitalAsset +retiredMediaAssets").lean(),
        models.history.find().select("_id medico firmaMedico.url firmaMedico.asset").lean(),
        models.treatment.find().select("_id profesionalId rol imagenes").lean(),
      ]);
      const inventory = collectMigrationCandidates({ users, histories, treatments, cloudName: process.env.CLOUDINARY_CLOUD_NAME });
      const selected = inventory.candidates.slice(0, options.limit || MAX_BATCH_SIZE);
      const entries = [];
      const inspectionErrors = [];
      for (const candidate of selected) {
        try { entries.push(await inspectCandidate(candidate, provider)); }
        catch { inspectionErrors.push({ reason: "provider_or_integrity_check_failed", referenceCount: candidate.references.length }); }
      }
      const manifest = { version: MANIFEST_VERSION, origin, createdAt: new Date().toISOString(), entries, exclusions: inventory.exclusions, inspectionErrors };
      await writeManifest(target, manifest, { create: true });
      console.log(JSON.stringify({ mode: "dry-run", candidateCount: inventory.candidates.length, inspected: selected.length, planned: entries.length, excluded: inventory.exclusions.length, inspectionErrors: inspectionErrors.length, remoteWrites: 0 }));
    }
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof MediaMigrationError ? error.code : "migration_failed_review_private_checkpoint" }));
  process.exitCode = 1;
});

module.exports = { parseArguments, manifestPath, createRepository, main };
