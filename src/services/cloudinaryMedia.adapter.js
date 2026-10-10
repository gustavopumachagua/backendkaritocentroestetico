const https = require("node:https");
const cloudinary = require("../config/cloudinary");
const AppError = require("../errors/AppError");
const { assetFromUpload, normalizeAsset } = require("../helpers/mediaAsset");
const { hasAllowedImageSignature } = require("../helpers/imageFileValidator");

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Fixed upstream allow-list: never fetch a client-provided URL or follow redirects. */
function assertDownloadUrl(value, cloudName) {
  let url;
  try { url = new URL(value); } catch { throw new AppError("No se pudo preparar la imagen protegida.", 502); }
  if (url.protocol !== "https:" || url.hostname !== "api.cloudinary.com" || url.port || url.username || url.password ||
      url.pathname !== `/v1_1/${cloudName}/image/download`) {
    throw new AppError("No se pudo preparar la imagen protegida.", 502);
  }
  return url;
}

function fetchImage(value, cloudName, get = https.get) {
  const url = assertDownloadUrl(value, cloudName);
  return new Promise((resolve, reject) => {
    const failure = (status) => {
      const error = new AppError("No se pudo obtener la imagen protegida. Inténtalo nuevamente.", 502);
      // Server-only retry discriminator, never serialized to a client or log.
      if (status) error.upstreamStatus = status;
      return error;
    };
    let finished = false;
    let absoluteTimeout;
    const finish = (error, image) => {
      if (finished) return;
      finished = true;
      clearTimeout(absoluteTimeout);
      if (error) reject(error); else resolve(image);
    };
    let received = 0;
    const request = get(url, { headers: { Accept: "image/jpeg,image/png,image/webp" } }, (response) => {
      const contentType = String(response.headers["content-type"] || "").split(";")[0].toLowerCase();
      if (response.statusCode !== 200 || !TYPES.has(contentType) || Number(response.headers["content-length"] || 0) > MAX_IMAGE_BYTES) {
        response.destroy(); finish(failure(response.statusCode)); return;
      }
      const chunks = [];
      response.on("data", (chunk) => {
        received += chunk.length;
        if (received > MAX_IMAGE_BYTES) { response.destroy(); request.destroy(); finish(failure()); return; }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (!received || !response.complete) { finish(failure()); return; }
        const bytes = Buffer.concat(chunks);
        if (!hasAllowedImageSignature(bytes.subarray(0, 12))) { finish(failure()); return; }
        finish(null, { bytes, contentType });
      });
      response.on("error", () => finish(failure()));
      response.on("aborted", () => finish(failure()));
    });
    request.setTimeout(10000, () => { request.destroy(); finish(failure()); });
    absoluteTimeout = setTimeout(() => { request.destroy(); finish(failure()); }, 15000);
    if (finished) clearTimeout(absoluteTimeout);
    request.on("error", () => finish(failure()));
  });
}

async function uploadImage(file, { folder, transformation }) {
  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder, resource_type: "image", type: "authenticated", format: "webp", transformation,
    });
    const asset = normalizeAsset(assetFromUpload(result), folder);
    if (!asset || result.type !== "authenticated" || result.resource_type !== "image") throw new Error("Unexpected delivery type");
    return asset;
  } catch {
    // Provider errors can contain signed URLs. Do not propagate or log them.
    throw new AppError("No se pudo subir la imagen protegida. Inténtalo nuevamente.", 502);
  }
}

async function downloadImage(asset, { download = fetchImage, now = Date.now } = {}) {
  const fetchType = async (type) => {
    let url;
    try {
      url = cloudinary.utils.private_download_url(asset.public_id, asset.format, {
        resource_type: "image", type, attachment: false,
        expires_at: Math.floor(now() / 1000) + 60,
      });
    } catch { throw new AppError("No se pudo preparar la imagen protegida.", 502); }
    return download(url, cloudinary.config().cloud_name);
  };
  try { return await fetchType(asset.type); } catch (error) {
    // An interrupted migration may have renamed Cloudinary before committing
    // metadata. Read the same authorized asset privately, never a public URL.
    if (asset.type === "upload" && error.upstreamStatus === 404) return fetchType("authenticated");
    throw error;
  }
}

module.exports = { uploadImage, downloadImage, assertDownloadUrl, fetchImage, MAX_IMAGE_BYTES };
