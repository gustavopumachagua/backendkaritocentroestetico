const { mediaVersion } = require("./mediaAsset");
const PRIVATE_KEYS = new Set(["asset", "avatarAsset", "firmaDigitalAsset", "avatarPublicId", "firmaDigitalPublicId", "retiredMediaAssets", "public_id", "asset_id"]);

const getId = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return typeof value === "string" ? value : "";
};
function versioned(path, asset, fallback, existingUrl = "") {
  const existingVersion = String(existingUrl).startsWith(`${path}?v=`) ? String(existingUrl).slice(path.length).match(/^\?v=(\d{1,16})$/)?.[1] : null;
  return `${path}?v=${asset?.version || fallback ? mediaVersion(asset, fallback) : existingVersion || "0"}`;
}
const hasImage = (url, asset) => Boolean(asset?.public_id || (typeof url === "string" && url.trim()));

/** Response boundary only: retain internal legacy references without publishing them. */
function presentMedia(value) {
  if (value === null || value === undefined || value instanceof Date || Buffer.isBuffer(value)) return value;
  if (typeof value !== "object") return value;
  if (value._bsontype === "ObjectId") return String(value);
  if (Array.isArray(value)) return value.map(presentMedia);
  const record = typeof value.toObject === "function" ? value.toObject() : value;
  const id = getId(record);
  const output = Object.fromEntries(Object.entries(record).filter(([key]) => !PRIVATE_KEYS.has(key)).map(([key, nested]) => [key, presentMedia(nested)]));

  if (Object.hasOwn(record, "avatar")) {
    const isDefault = record.avatar === process.env.DEFAULT_AVATAR_URL && !record.avatarAsset && !record.avatarPublicId;
    output.avatar = isDefault ? record.avatar : id && hasImage(record.avatar, record.avatarAsset)
      ? versioned(`/api/media/avatars/${encodeURIComponent(id)}`, record.avatarAsset, record.updatedAt, record.avatar) : null;
  }
  if (Object.hasOwn(record, "firmaDigital")) {
    output.firmaDigital = id && hasImage(record.firmaDigital, record.firmaDigitalAsset)
      ? versioned(`/api/media/signatures/${encodeURIComponent(id)}`, record.firmaDigitalAsset, record.updatedAt, record.firmaDigital) : null;
  }
  if (record.firmaMedico && id) {
    const signature = hasImage(record.firmaMedico.url, record.firmaMedico.asset)
      ? versioned(`/api/media/histories/${encodeURIComponent(id)}/signature`, record.firmaMedico.asset, record.updatedAt, record.firmaMedico.url) : "";
    output.firmaMedico = { ...output.firmaMedico, url: signature };
    if (Object.hasOwn(record, "signatureUrl")) output.signatureUrl = signature;
  }
  if (Array.isArray(record.imagenes) && id) {
    output.imagenes = record.imagenes.map((image, index) => {
      const imageId = getId(image) || String(index);
      const url = versioned(`/api/media/treatments/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`, image.asset, record.updatedAt || record.createdAt);
      return { ...presentMedia(image), url, thumbnailUrl: url };
    });
  }
  return output;
}

function protectedMediaPresentation(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => json(presentMedia(body));
  next();
}

module.exports = { presentMedia, protectedMediaPresentation, versioned };
