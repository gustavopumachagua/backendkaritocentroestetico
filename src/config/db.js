const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("✅ Conexión a MongoDB exitosa");
  } catch (error) {
    console.error("❌ Error en conexión a MongoDB:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
