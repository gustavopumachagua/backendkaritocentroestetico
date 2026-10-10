const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString("hex")}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5,
    fields: 20,
    fieldNameSize: 100,
    fieldSize: 64 * 1024,
    parts: 30,
  },
  fileFilter: (req, file, cb) => {
    if (!allowedImageTypes.includes(file.mimetype)) {
      return cb(new Error("Solo se permiten imágenes JPG, PNG o WEBP"));
    }

    return cb(null, true);
  },
});

module.exports = upload;
