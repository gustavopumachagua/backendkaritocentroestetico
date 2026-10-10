const { isDeepStrictEqual } = require("node:util");

const MANIFEST_VERSION = 1;
const MAX_BATCH_SIZE = 25;
const SUPPORTED_FORMATS = new Set(["jpg", "jpeg", "png", "webp"]);

class MediaMigrationError extends Error {
  constructor(code) {
    super(code);
    this.name = "MediaMigrationError";
    this.code = code;
  }
}

const id = (value) => String(value?._id || value || "");
const copy = (value) => (value == null ? null : JSON.parse(JSON.stringify(value)));

/** Only persistent ownership and known Cloudinary folders are migration evidence. */
function collectMigrationCandidates({ users, histories, treatments, cloudName, resolveAsset }) {
  const resolve = resolveAsset || require("../helpers/mediaAsset").resolveStoredAsset;
  const accounts = new Map(users.map((user) => [id(user._id), user]));
  const groups = new Map();
  const exclusions = [];

  function add(reference, input, folder, ownerId) {
    const owner = accounts.get(ownerId);
    if (!owner || (reference.kind === "signature" && owner.rol !== "doctor")) {
      exclusions.push({ documentType: reference.documentType, documentId: reference.documentId, reason: "ownership_unverified" });
      return;
    }
    let asset;
    try {
      asset = resolve({ ...input, folder, cloudName });
    } catch {
      asset = null;
    }
    if (!asset?.public_id || asset.resource_type !== "image" || !asset.public_id.startsWith(`${folder}/`)) {
      if (input.url || input.publicId || input.asset) exclusions.push({ documentType: reference.documentType, documentId: reference.documentId, reason: "asset_unverified" });
      return;
    }
    if (asset.type === "authenticated" && asset.asset_id) return;
    if (asset.type && !["upload", "authenticated"].includes(asset.type)) {
      exclusions.push({ documentType: reference.documentType, documentId: reference.documentId, reason: "delivery_type_requires_review" });
      return;
    }
    const key = asset.public_id;
    const group = groups.get(key) || { publicId: key, sourceType: asset.type || "upload", ownerIds: new Set(), expectedAssetIds: new Set(), references: [] };
    group.ownerIds.add(ownerId);
    if (asset.asset_id) group.expectedAssetIds.add(asset.asset_id);
    group.references.push({ ...reference, ownerId, previousAsset: copy(input.asset), sourcePublicId: input.publicId || "", sourceUrl: input.url || "", publicIdSnapshot: input.publicId ?? null, urlSnapshot: input.url ?? null });
    groups.set(key, group);
  }

  for (const user of users) {
    add({ kind: "avatar", documentType: "user", documentId: id(user._id), assetField: "avatarAsset", publicIdField: "avatarPublicId", urlField: "avatar" }, { asset: user.avatarAsset, publicId: user.avatarPublicId, url: user.avatar }, "avatars", id(user._id));
    add({ kind: "signature", documentType: "user", documentId: id(user._id), assetField: "firmaDigitalAsset", publicIdField: "firmaDigitalPublicId", urlField: "firmaDigital" }, { asset: user.firmaDigitalAsset, publicId: user.firmaDigitalPublicId, url: user.firmaDigital }, "firmas", id(user._id));
    for (const [retiredIndex, retired] of (user.retiredMediaAssets || []).entries()) {
      if (!["avatar", "signature"].includes(retired.kind)) {
        exclusions.push({ documentType: "user", documentId: id(user._id), reason: "retired_kind_unverified" });
        continue;
      }
      add({ kind: retired.kind, documentType: "user", documentId: id(user._id), retiredIndex, retiredId: id(retired._id), assetField: `retiredMediaAssets.${retiredIndex}.asset`, urlField: `retiredMediaAssets.${retiredIndex}.url` }, { asset: retired.asset, url: retired.url }, retired.kind === "avatar" ? "avatars" : "firmas", id(user._id));
    }
  }
  for (const history of histories) {
    add({ kind: "signature", documentType: "history", documentId: id(history._id), assetField: "firmaMedico.asset", urlField: "firmaMedico.url" }, { asset: history.firmaMedico?.asset, url: history.firmaMedico?.url }, "firmas", id(history.medico));
  }
  for (const treatment of treatments) {
    const owner = accounts.get(id(treatment.profesionalId));
    if ((treatment.imagenes || []).length && (!owner || owner.rol !== treatment.rol || !["doctor", "cosmiatra"].includes(owner.rol))) {
      exclusions.push({ documentType: "treatment", documentId: id(treatment._id), reason: "ownership_unverified" });
      continue;
    }
    for (const [imageIndex, image] of (treatment.imagenes || []).entries()) {
      add({ kind: "treatment", documentType: "treatment", documentId: id(treatment._id), imageIndex, imageId: id(image._id), assetField: `imagenes.${imageIndex}.asset`, publicIdField: `imagenes.${imageIndex}.public_id`, urlField: `imagenes.${imageIndex}.url` }, { asset: image.asset, publicId: image.public_id, url: image.url }, "tratamientos", id(treatment.profesionalId));
    }
  }

  const candidates = [];
  for (const group of groups.values()) {
    if (group.ownerIds.size !== 1 || group.expectedAssetIds.size > 1) {
      exclusions.push({ reason: "conflicting_ownership_or_asset", referenceCount: group.references.length });
      continue;
    }
    candidates.push({ publicId: group.publicId, sourceType: group.sourceType, expectedAssetId: [...group.expectedAssetIds][0] || "", references: group.references });
  }
  candidates.sort((a, b) => a.publicId.localeCompare(b.publicId));
  return { candidates, exclusions };
}

function assertOriginalContents(result, originalAsset) {
  for (const key of ["format", "bytes", "width", "height", "etag"]) {
    if (originalAsset?.[key] == null) continue;
    const expected = key === "format" ? String(originalAsset[key]).toLowerCase() : originalAsset[key];
    const actual = key === "format" ? String(result?.[key] || "").toLowerCase() : result?.[key];
    if (actual !== expected) throw new MediaMigrationError("asset_content_mismatch");
  }
}

function protectedAsset(result, expectedPublicId, expectedAssetId, originalAsset) {
  if (!result || result.public_id !== expectedPublicId || result.resource_type !== "image" || !result.asset_id || result.type !== "authenticated" || !SUPPORTED_FORMATS.has(String(result.format || "").toLowerCase()) || (expectedAssetId && result.asset_id !== expectedAssetId)) {
    throw new MediaMigrationError("asset_integrity_mismatch");
  }
  assertOriginalContents(result, originalAsset);
  return Object.fromEntries(["asset_id", "public_id", "resource_type", "type", "format", "version", "bytes", "width", "height"].filter((key) => result[key] != null).map((key) => [key, result[key]]));
}

function providerStatus(error) {
  return Number(error?.http_code || error?.statusCode || error?.status || 0);
}

async function withRetry(operation, { attempts = 4, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const status = providerStatus(error);
      if (attempt + 1 >= attempts || !(status === 429 || status >= 500)) throw error;
      await wait(Math.min(250 * 2 ** attempt, 2000));
    }
  }
}

/** Metadata-only inspection: never downloads a clinical image. */
async function inspectCandidate(candidate, provider, retryOptions) {
  let result;
  let sourceType = candidate.sourceType;
  try {
    result = await withRetry(() => provider.inspect(candidate.publicId, sourceType), retryOptions);
  } catch (error) {
    if (providerStatus(error) !== 404 || sourceType !== "upload") throw error;
    sourceType = "authenticated";
    result = await withRetry(() => provider.inspect(candidate.publicId, sourceType), retryOptions);
  }
  if (result.public_id !== candidate.publicId || result.resource_type !== "image" || result.type !== sourceType || !result.asset_id || !SUPPORTED_FORMATS.has(String(result.format || "").toLowerCase()) || (candidate.expectedAssetId && result.asset_id !== candidate.expectedAssetId)) {
    throw new MediaMigrationError("asset_integrity_mismatch");
  }
  const originalAsset = Object.fromEntries(["asset_id", "public_id", "resource_type", "type", "format", "version", "bytes", "width", "height", "etag"].filter((key) => result[key] != null).map((key) => [key, result[key]]));
  return { ...candidate, assetId: result.asset_id, sourceType, originalAsset, state: "planned", references: (candidate.references || []).map((reference) => ({ ...reference, state: "pending" })) };
}

function selectEntries(manifest, { assetIds = [], limit } = {}) {
  if (manifest?.version !== MANIFEST_VERSION || !Array.isArray(manifest.entries)) throw new MediaMigrationError("invalid_manifest");
  if (assetIds.length === 0 && limit !== 1) throw new MediaMigrationError("explicit_targets_required");
  if (assetIds.length > MAX_BATCH_SIZE || new Set(assetIds).size !== assetIds.length) throw new MediaMigrationError("invalid_target_batch");
  const entries = assetIds.length ? manifest.entries.filter((entry) => assetIds.includes(entry.assetId)) : manifest.entries.slice(0, 1);
  if (assetIds.length && entries.length !== assetIds.length) throw new MediaMigrationError("target_not_in_manifest");
  if (!entries.length || entries.length > MAX_BATCH_SIZE || entries.some((entry) => !entry.assetId || !entry.references?.length)) throw new MediaMigrationError("invalid_target_batch");
  return entries;
}

/**
 * Cloudinary + MongoDB are not one transaction. Checkpoints surround each step.
 * A failed database write leaves the asset PRIVATE; resume repairs associations.
 * There is deliberately no destroy, copy-upload, or public rollback operation.
 */
async function applyMigration({ manifest, assetIds, limit, confirmed, provider, repository, checkpoint, retryOptions }) {
  if (confirmed !== true) throw new MediaMigrationError("confirmation_required");
  const entries = selectEntries(manifest, { assetIds, limit });
  const summary = { selected: entries.length, completed: 0, failed: 0 };
  for (const entry of entries) {
    if (entry.state === "completed") { summary.completed += 1; continue; }
    try {
      // Check all bindings before changing a public resource for the first time.
      if (entry.state === "planned" || entry.state === "preflight_failed") {
        for (const reference of entry.references) {
          if (!(await repository.matchesSnapshot(reference))) throw new MediaMigrationError("reference_changed_before_migration");
        }
      }
      entry.state = "inspecting";
      entry.error = null;
      await checkpoint(manifest);
      const inspected = await inspectCandidate({ publicId: entry.publicId, sourceType: "upload", expectedAssetId: entry.assetId }, provider, retryOptions);
      let result = inspected.originalAsset;
      assertOriginalContents(result, entry.originalAsset);
      if (inspected.sourceType === "upload") {
        // A retry after a failed preflight must not bypass ownership guards.
        for (const reference of entry.references) {
          if (!(await repository.matchesSnapshot(reference))) throw new MediaMigrationError("reference_changed_before_migration");
        }
        entry.state = "renaming";
        await checkpoint(manifest);
        result = await withRetry(() => provider.rename(entry.publicId, entry.publicId, { resource_type: "image", type: "upload", to_type: "authenticated", overwrite: false, invalidate: true }), retryOptions);
      }
      const asset = protectedAsset(result, entry.publicId, entry.assetId, entry.originalAsset);
      entry.protectedAsset = asset;
      entry.state = "private_pending_references";
      await checkpoint(manifest);
      for (const reference of entry.references) {
        if (reference.state === "updated") continue;
        const result = await repository.updateReference(reference, asset);
        if (!result && !(await repository.hasAsset(reference, asset))) throw new MediaMigrationError("reference_update_conflict");
        reference.state = "updated";
        await checkpoint(manifest);
      }
      entry.state = "completed";
      await checkpoint(manifest);
      summary.completed += 1;
    } catch (error) {
      // Never persist upstream messages: they can contain credentials/URLs.
      entry.error = error instanceof MediaMigrationError ? error.code : providerStatus(error) === 404 ? "provider_asset_not_found" : "provider_or_database_error";
      entry.state = entry.state === "planned" ? "preflight_failed" : "needs_review";
      await checkpoint(manifest);
      summary.failed += 1;
    }
  }
  return summary;
}

function sameAsset(left, right) {
  return isDeepStrictEqual(copy(left), copy(right));
}

module.exports = { MANIFEST_VERSION, MAX_BATCH_SIZE, MediaMigrationError, collectMigrationCandidates, inspectCandidate, applyMigration, selectEntries, protectedAsset, withRetry, sameAsset };
