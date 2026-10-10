const cloudinary = require("../config/cloudinary");
const userRepository = require("../repositories/user.repository");
const historyRepository = require("../repositories/historiaClinica.repository");
const treatmentRepository = require("../repositories/tratamiento.repository");
const appointmentRepository = require("../repositories/cita.repository");
const { resolveStoredAsset } = require("../helpers/mediaAsset");
const mediaAdapter = require("./cloudinaryMedia.adapter");
const AppError = require("../errors/AppError");
const { OBJECT_ID_REGEX, USER_ROLES } = require("../constants");

const idOf = (value) => String(value?._id || value?.id || value || "");
const requireId = (id) => { if (!OBJECT_ID_REGEX.test(String(id))) throw new AppError("Identificador de imagen no válido.", 400); };
const requireStaff = (actor) => { if (!actor?.id || !USER_ROLES.includes(actor.rol)) throw new AppError("No tienes permiso para consultar esta imagen.", 403); };
const forbidden = () => { throw new AppError("No tienes permiso para consultar esta imagen.", 403); };

function createMediaService({ users = userRepository, histories = historyRepository, treatments = treatmentRepository, appointments = appointmentRepository, adapter = mediaAdapter, cloudName = () => cloudinary.config().cloud_name } = {}) {
  async function deliver(record, folder) {
    const asset = resolveStoredAsset({ ...record, folder, cloudName: cloudName() });
    if (!asset) throw new AppError("La imagen no está disponible.", 404);
    return adapter.downloadImage(asset);
  }

  async function avatar(userId, actor) {
    requireStaff(actor); requireId(userId);
    const user = await users.findById(userId);
    if (!user || !user.activo) throw new AppError("La imagen no está disponible.", 404);
    return deliver({ asset: user.avatarAsset, publicId: user.avatarPublicId, url: user.avatar }, "avatars");
  }

  async function signature(userId, actor) {
    requireStaff(actor); requireId(userId);
    if (actor.rol !== "doctor" || idOf(actor.id) !== idOf(userId)) forbidden();
    const user = await users.findById(userId);
    if (!user || user.rol !== "doctor") throw new AppError("La imagen no está disponible.", 404);
    return deliver({ asset: user.firmaDigitalAsset, publicId: user.firmaDigitalPublicId, url: user.firmaDigital }, "firmas");
  }

  async function historySignature(historyId, actor) {
    requireStaff(actor); requireId(historyId);
    if (actor.rol !== "doctor") forbidden();
    const history = await histories.findById(historyId);
    if (!history) throw new AppError("La imagen no está disponible.", 404);
    if (idOf(history.medico) !== idOf(actor.id)) forbidden();
    // Current professional profile stays authoritative, as before this protection.
    const user = await users.findById(idOf(history.medico));
    const current = user && (user.firmaDigitalAsset || user.firmaDigital)
      ? { asset: user.firmaDigitalAsset, publicId: user.firmaDigitalPublicId, url: user.firmaDigital }
      : { asset: history.firmaMedico?.asset, url: history.firmaMedico?.url };
    return deliver(current, "firmas");
  }

  async function treatmentImage(treatmentId, imageId, actor) {
    requireStaff(actor); requireId(treatmentId);
    const treatment = await (treatments.findMediaById || treatments.findById)(treatmentId);
    if (!treatment) throw new AppError("La imagen no está disponible.", 404);
    if (actor.rol !== "administrador") {
      if (treatment.profesionalId) {
        if (idOf(treatment.profesionalId) !== idOf(actor.id) || (treatment.rol && treatment.rol !== actor.rol)) forbidden();
      } else {
        if (!treatment.cita) forbidden();
        const appointment = await appointments.findById(idOf(treatment.cita));
        if (!appointment || idOf(appointment.profesional) !== idOf(actor.id) || appointment.rol !== actor.rol) forbidden();
      }
    }
    const images = treatment.imagenes || [];
    const image = images.find((item) => idOf(item._id) === String(imageId)) ||
      (/^(0|[1-9]\d*)$/.test(String(imageId)) && !images[Number(imageId)]?._id ? images[Number(imageId)] : null);
    if (!image) throw new AppError("La imagen no está disponible.", 404);
    return deliver({ asset: image.asset, publicId: image.public_id, url: image.url }, "tratamientos");
  }

  return { avatar, signature, historySignature, treatmentImage };
}

module.exports = { ...createMediaService(), createMediaService };
