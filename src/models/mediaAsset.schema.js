const mongoose = require("mongoose");

// Stable server-only asset identity. Delivery URLs and credentials never live here.
module.exports = new mongoose.Schema({
  asset_id: { type: String, maxlength: 200 },
  public_id: { type: String, required: true, maxlength: 1024 },
  resource_type: { type: String, enum: ["image"], default: "image" },
  type: { type: String, enum: ["authenticated", "private", "upload"], required: true },
  format: { type: String, enum: ["jpg", "jpeg", "png", "webp"], required: true },
  version: { type: Number, min: 0 },
  bytes: { type: Number, min: 0 },
  width: { type: Number, min: 0 },
  height: { type: Number, min: 0 },
}, { _id: false });
