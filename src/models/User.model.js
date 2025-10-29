const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    rol: {
      type: String,
      enum: ["administrador", "doctor", "cosmiatra"],
      default: "cosmiatra",
      lowercase: true,
    },
    activo: { type: Boolean, default: true },
    avatar: {
      type: String,
      default:
        "https://res.cloudinary.com/db8tsilie/image/upload/v1759552820/avatar_ilbvur.jpg",
    },
    avatarPublicId: {
      type: String,
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
