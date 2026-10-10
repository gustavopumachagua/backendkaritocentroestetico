const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { USER_ROLES } = require("../constants");

const userSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 160 },
    // Internal ownership history, never accepted from a public profile DTO.
    nombresAnteriores: {
      type: [{ type: String, trim: true, maxlength: 160 }],
      default: [],
      select: false,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    password: { type: String, required: true },
    rol: {
      type: String,
      enum: USER_ROLES,
      default: "cosmiatra",
      lowercase: true,
    },
    activo: { type: Boolean, default: true },
    avatar: {
      type: String,
      default: process.env.DEFAULT_AVATAR_URL,
    },
    avatarPublicId: {
      type: String,
      default: null,
    },
    cmp: {
      type: String,
      default: null,
      validate: {
        validator: function (v) {
          return v === null || /^\d{6}$/.test(v);
        },
        message: "El CMP debe ser un número de 6 dígitos",
      },
    },
    firmaDigital: {
      type: String,
      default: null,
    },
    firmaDigitalPublicId: {
      type: String,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

module.exports = mongoose.model("Usuario", userSchema);
