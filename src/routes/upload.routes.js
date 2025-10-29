const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");
const authJwt = require("../middlewares/authJwt");
const User = require("../models/User.model");

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Solo se permiten imágenes (JPG, PNG o WEBP)"));
    }
    cb(null, true);
  },
});

router.post("/", authJwt, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se envió ningún archivo" });
    }
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    if (user.avatarPublicId) {
      try {
        await cloudinary.uploader.destroy(user.avatarPublicId);
      } catch (err) {
        console.warn("No se pudo eliminar la imagen anterior:", err.message);
      }
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "avatars",
      transformation: [{ width: 300, height: 300, crop: "fill" }],
    });

    fs.unlinkSync(req.file.path);

    user.avatar = result.secure_url;
    user.avatarPublicId = result.public_id;
    await user.save();

    res.json({ url: result.secure_url });
  } catch (error) {
    console.error("Error al subir imagen:", error);

    if (error.message.includes("Solo se permiten imágenes")) {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ message: "La imagen no debe superar los 2 MB" });
    }

    res.status(500).json({ message: "Error al subir imagen" });
  }
});

module.exports = router;
