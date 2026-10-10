const express = require("express");
const {
  login,
  changePassword,
  resetPassword,
} = require("../controllers/auth.controller");
const {
  loginRateLimiter,
  passwordResetRateLimiter,
} = require("../middlewares/rateLimit");

const router = express.Router();

router.post("/login", loginRateLimiter, login);
router.post("/change-password", passwordResetRateLimiter, changePassword);
router.post("/reset-password", passwordResetRateLimiter, resetPassword);

module.exports = router;
