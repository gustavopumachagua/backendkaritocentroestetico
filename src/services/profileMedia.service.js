const userRepository = require("../repositories/user.repository");
const historyService = require("./historiaClinica.service");
const mediaAdapter = require("./cloudinaryMedia.adapter");
const cloudinary = require("../config/cloudinary");
const { resolveStoredAsset } = require("../helpers/mediaAsset");
const { validateImageFile } = require("../helpers/imageFileValidator");
const { deleteLocalFile } = require("../helpers/fileHelper");
const { versioned } = require("../helpers/mediaPresentation");
const AppError = require("../errors/AppError");

function createProfileMediaService({ users = userRepository, histories = historyService, adapter = mediaAdapter, validate = validateImageFile, clean = deleteLocalFile, cloudName = () => cloudinary.config().cloud_name } = {}) {
  async function uploadProfileImage(file, actor, kind) {
    if (!file) throw new AppError("No se envió ningún archivo", 400);
    try {
      if (kind === "signature" && actor.rol !== "doctor") throw new AppError("Solo el doctor puede registrar una firma digital.", 403);
      await validate(file);
      const user = await users.findById(actor.id, "+retiredMediaAssets");
      if (!user) throw new AppError("Usuario no encontrado", 404);
      const signature = kind === "signature";
      if (signature && user.rol !== "doctor") throw new AppError("Solo el doctor puede registrar una firma digital.", 403);
      const asset = await adapter.uploadImage(file, {
        folder: signature ? "firmas" : "avatars",
        transformation: signature
          ? [{ width: 400, height: 200, crop: "fit", quality: "auto:good" }]
          : [{ width: 300, height: 300, crop: "fill", gravity: "auto", quality: "auto:good" }],
      });
      const url = versioned(`/api/media/${signature ? "signatures" : "avatars"}/${String(user._id)}`, asset);
      const previousAsset = resolveStoredAsset({
        asset: signature ? user.firmaDigitalAsset : user.avatarAsset,
        publicId: signature ? user.firmaDigitalPublicId : user.avatarPublicId,
        url: signature ? user.firmaDigital : user.avatar,
        folder: signature ? "firmas" : "avatars", cloudName: cloudName(),
      });
      if (previousAsset && previousAsset.public_id !== asset.public_id) {
        if (!user.retiredMediaAssets) user.retiredMediaAssets = [];
        user.retiredMediaAssets.push({ kind, asset: previousAsset, url: (signature ? user.firmaDigital : user.avatar) || "", retiredAt: new Date() });
      }
      if (signature) {
        user.firmaDigital = url;
        user.firmaDigitalPublicId = asset.public_id;
        user.firmaDigitalAsset = asset;
      } else {
        user.avatar = url;
        user.avatarPublicId = asset.public_id;
        user.avatarAsset = asset;
      }
      // Existing assets and orphaned private uploads are deliberately retained.
      // Deletion/migration needs the separately approved operational workflow.
      await users.save(user);
      if (signature) await histories.sincronizarDatosMedicoEnHistorias(user);
      return { url };
    } finally { clean(file.path); }
  }
  return { uploadProfileImage };
}

module.exports = { ...createProfileMediaService(), createProfileMediaService };
