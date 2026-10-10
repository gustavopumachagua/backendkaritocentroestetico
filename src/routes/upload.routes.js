const express = require("express");
const router = express.Router();
const multer = require("multer");
const authJwt = require("../middlewares/authJwt");
const authorizeRole = require("../middlewares/authorizeRole");
const profileMediaService = require("../services/profileMedia.service");
const asyncHandler = require("../helpers/asyncHandler");
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
    res.json(await profileMediaService.uploadProfileImage(req.file, req.user, "avatar"));
  }),
);

router.post(
  "/firma",
  authJwt,
  authorizeRole("doctor"),
  uploadRateLimiter,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    res.json(await profileMediaService.uploadProfileImage(req.file, req.user, "signature"));
  }),
);

module.exports = router;
