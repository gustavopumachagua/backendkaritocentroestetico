const fs = require("fs");
const cloudinary = require("../config/cloudinary");
const Tratamiento = require("../models/Tratamiento.model");
const Cita = require("../models/Cita.model");

exports.crearTratamiento = async (req, res) => {
  try {
    const {
      nombre,
      edad,
      sexo,
      servicio,
      fecha,
      observacion,
      insumos,
      profesional,
      rol,
    } = req.body;

    const serviciosArray =
      typeof servicio === "string" ? servicio.split(",") : servicio;
    const insumosArray =
      typeof insumos === "string" ? insumos.split(",") : insumos;

    const imagenesSubidas = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: "tratamientos",
        });
        imagenesSubidas.push({
          url: result.secure_url,
          public_id: result.public_id,
        });
        fs.unlinkSync(file.path);
      }
    }

    const nuevoTratamiento = new Tratamiento({
      nombre,
      edad,
      sexo,
      servicio: serviciosArray,
      fecha,
      observacion,
      insumos: insumosArray,
      profesional,
      rol,
      imagenes: imagenesSubidas,
    });

    await nuevoTratamiento.save();

    await Cita.findOneAndUpdate(
      { cliente: nombre, fecha },
      { estado: "atendido" }
    );

    const io = req.app.get("io");
    io.emit("tratamientoActualizado", {
      message: "Nuevo tratamiento agregado",
      tratamiento: nuevoTratamiento,
    });

    res.status(201).json({
      message: "✅ Tratamiento registrado y cita marcada como atendida.",
      tratamiento: nuevoTratamiento,
    });
  } catch (error) {
    console.error("Error al crear tratamiento:", error);
    res.status(500).json({ message: "Error al guardar el tratamiento" });
  }
};

exports.obtenerTratamientos = async (req, res) => {
  try {
    const tratamientos = await require("../models/Tratamiento.model")
      .find()
      .sort({ createdAt: -1 });

    res.json(tratamientos);
  } catch (error) {
    console.error("Error al obtener tratamientos:", error);
    res.status(500).json({ message: "Error al obtener tratamientos" });
  }
};
