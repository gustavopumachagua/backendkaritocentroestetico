const express = require("express");
const {
  login,
  changePassword,
  resetPassword,
} = require("../controllers/auth.controller");

const router = express.Router();

router.post("/login", login);
router.post("/change-password", changePassword);
router.post("/reset-password", resetPassword);

module.exports = router;
