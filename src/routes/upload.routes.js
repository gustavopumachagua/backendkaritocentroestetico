const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const authJwt = require("../middlewares/authJwt");
const userRepository = require("../repositories/user.repository");
const historiaClinicaService = require("../services/historiaClinica.service");
const asyncHandler = require("../helpers/asyncHandler");
const { deleteLocalFile } = require("../helpers/fileHelper");
const { validateImageFile } = require("../helpers/imageFileValidator");
const { uploadRateLimiter } = require("../middlewares/rateLimit");

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
    fields: 5,
    fieldNameSize: 100,
    fieldSize: 64 * 1024,
    parts: 8,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Solo se permiten imágenes (JPG, PNG o WEBP)"));
    }
    cb(null, true);
  },
});

router.post(
  "/",
  authJwt,
  uploadRateLimiter,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No se envió ningún archivo" });
    }

    try {
      await validateImageFile(req.file);
      const user = await userRepository.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      if (user.avatarPublicId) {
        try {
          await cloudinary.uploader.destroy(user.avatarPublicId);
        } catch (err) {
          console.warn(
            "No se pudo eliminar la imagen anterior:",
            err.message,
          );
        }
      }

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "avatars",
        resource_type: "image",
        format: "webp",
        transformation: [
          {
            width: 300,
            height: 300,
            crop: "fill",
            gravity: "auto",
            quality: "auto:good",
          },
        ],
      });

      deleteLocalFile(req.file.path);

      user.avatar = result.secure_url;
      user.avatarPublicId = result.public_id;
      await userRepository.save(user);

      res.json({ url: result.secure_url });
    } catch (error) {
      deleteLocalFile(req.file?.path);
      throw error;
    }
  }),
);

router.post(
  "/firma",
  authJwt,
  uploadRateLimiter,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No se envió ningún archivo" });
    }

    try {
      await validateImageFile(req.file);
      const user = await userRepository.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "firmas",
        resource_type: "image",
        format: "webp",
        transformation: [
          {
            width: 400,
            height: 200,
            crop: "fit",
            quality: "auto:good",
          },
        ],
      });

      deleteLocalFile(req.file.path);

      const previousPublicId = user.firmaDigitalPublicId;
      user.firmaDigital = result.secure_url;
      user.firmaDigitalPublicId = result.public_id;

      try {
        await userRepository.save(user);
      } catch (saveError) {
        // The database remains unchanged, so remove the orphaned upload and
        // preserve the doctor's previous signature.
        try {
          await cloudinary.uploader.destroy(result.public_id);
        } catch (cleanupError) {
          console.warn(
            "No se pudo eliminar la nueva firma tras un error de guardado:",
            cleanupError.message,
          );
        }
        throw saveError;
      }

      // The signature is embedded in the clinical-history metadata so
      // regenerated documents use the replacement immediately. The history
      // service scopes this update to histories owned by a doctor only.
      await historiaClinicaService.sincronizarDatosMedicoEnHistorias(user);

      // Do not remove the current signature until the replacement was both
      // uploaded and persisted successfully.
      if (previousPublicId) {
        try {
          await cloudinary.uploader.destroy(previousPublicId);
        } catch (destroyError) {
          console.warn(
            "No se pudo eliminar la firma anterior:",
            destroyError.message,
          );
        }
      }

      res.json({ url: result.secure_url });
    } catch (error) {
      deleteLocalFile(req.file?.path);
      throw error;
    }
  }),
);

module.exports = router;
