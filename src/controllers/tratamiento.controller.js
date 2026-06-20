const fs = require("fs");
const cloudinary = require("../config/cloudinary");
const Tratamiento = require("../models/Tratamiento.model");
const Cita = require("../models/Cita.model");

const deleteLocalFile = (filePath) => {
  if (!filePath) return;

  fs.promises.unlink(filePath).catch((error) => {
    console.warn("No se pudo eliminar el archivo temporal:", error.message);
  });
};

const buildCloudinaryUrl = (publicId, transformation) => {
  return cloudinary.url(publicId, {
    secure: true,
    transformation,
  });
};

exports.crearTratamiento = async (req, res) => {
  try {
    const {
      nombre,
      sexo,
      celular,
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
        try {
          const result = await cloudinary.uploader.upload(file.path, {
            folder: "tratamientos",
            resource_type: "image",
            format: "webp",
            transformation: [
              {
                width: 1600,
                height: 1600,
                crop: "limit",
                quality: "auto:good",
              },
            ],
          });

          imagenesSubidas.push({
            url: result.secure_url,
            thumbnailUrl: buildCloudinaryUrl(result.public_id, [
              {
                width: 480,
                height: 360,
                crop: "fill",
                gravity: "auto",
                quality: "auto:eco",
                fetch_format: "auto",
              },
            ]),
            public_id: result.public_id,
          });
        } finally {
          deleteLocalFile(file.path);
        }
      }
    }

    const nuevoTratamiento = new Tratamiento({
      nombre,
      sexo,
      celular,
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
      { estado: "atendido" },
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
    if (req.files?.length) {
      req.files.forEach((file) => deleteLocalFile(file.path));
    }

    if (error.message?.includes("Solo se permiten imágenes")) {
      return res.status(400).json({ message: error.message });
    }

    if (error.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ message: "Cada imagen no debe superar los 5 MB" });
    }

    if (error.code === "LIMIT_FILE_COUNT") {
      return res
        .status(400)
        .json({ message: "Solo se permiten hasta 5 imágenes" });
    }

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
