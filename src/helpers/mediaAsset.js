const DELIVERY_TYPES = new Set(["upload", "private", "authenticated"]);
const IMAGE_FORMATS = new Set(["jpg", "jpeg", "png", "webp"]);
const { createHash } = require("node:crypto");

function normalizeAsset(value, folder) {
  const asset = value?.toObject ? value.toObject() : value;
  if (!asset || asset.resource_type !== "image" || !DELIVERY_TYPES.has(asset.type)) return null;
  const publicId = String(asset.public_id || "");
  if (!publicId.startsWith(`${folder}/`) || publicId.includes("..") || /[?#\\\x00-\x1f]/.test(publicId)) return null;
  const format = String(asset.format || "").toLowerCase();
  if (!IMAGE_FORMATS.has(format)) return null;
  return {
    asset_id: String(asset.asset_id || ""), public_id: publicId,
    resource_type: "image", type: asset.type, format,
    version: Number(asset.version) || 0,
    ...Object.fromEntries(["bytes", "width", "height"].filter((key) => Number.isFinite(asset[key])).map((key) => [key, asset[key]])),
  };
}

function assetFromUpload(result) {
  return {
    asset_id: result.asset_id, public_id: result.public_id,
    resource_type: "image", type: result.type || "authenticated",
    format: result.format || "webp", version: result.version,
    bytes: result.bytes, width: result.width, height: result.height,
  };
}

/** Accept only stored URLs for this account and the expected upload folder. */
function parseLegacyCloudinaryUrl(value, { folder, cloudName }) {
  if (!cloudName || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.port || url.username || url.password || url.search || url.hash) return null;
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (segments[0] !== cloudName || segments[1] !== "image" || !DELIVERY_TYPES.has(segments[2])) return null;
    const folderIndex = segments.indexOf(folder, 3);
    if (folderIndex < 3) return null;
    const filename = segments.slice(folderIndex).join("/");
    const match = filename.match(/^(.*)\.(jpg|jpeg|png|webp)$/i);
    if (!match) return null;
    const versionPart = segments.slice(3, folderIndex).find((part) => /^v\d+$/.test(part));
    return normalizeAsset({ public_id: match[1], resource_type: "image", type: segments[2], format: match[2].toLowerCase(), version: versionPart ? Number(versionPart.slice(1)) : 0 }, folder);
  } catch { return null; }
}

function resolveStoredAsset({ asset, publicId, url, folder, cloudName }) {
  const metadata = normalizeAsset(asset, folder);
  if (metadata) return metadata;
  const legacy = parseLegacyCloudinaryUrl(url, { folder, cloudName });
  if (!legacy || (publicId && legacy.public_id !== String(publicId))) return null;
  return legacy;
}

function mediaVersion(asset, fallback) {
  const version = Number(asset?.version);
  const identity = String(asset?.asset_id || asset?.public_id || "");
  // Cloudinary versions have second resolution. Distinct replacements within
  // the same second must still invalidate the browser's in-memory source.
  if (identity) return String(parseInt(createHash("sha256").update(`${identity}\0${version || 0}`).digest("hex").slice(0, 12), 16));
  if (version > 0) return String(version);
  const date = new Date(fallback || 0).getTime();
  return Number.isFinite(date) ? String(date) : "0";
}

module.exports = { assetFromUpload, normalizeAsset, parseLegacyCloudinaryUrl, resolveStoredAsset, mediaVersion };
