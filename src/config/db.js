const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  } catch (error) {
    console.error("❌ Error en conexión a MongoDB:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
