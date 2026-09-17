const cloudinary = require("../config/cloudinary");
const tratamientoRepository = require("../repositories/tratamiento.repository");
const citaRepository = require("../repositories/cita.repository");
const escapeRegex = require("../utils/escapeRegex");
const { deleteLocalFile } = require("../helpers/fileHelper");
const AppError = require("../errors/AppError");
const { OBJECT_ID_REGEX } = require("../constants");

/**
 * Servicio de lógica de negocio para Tratamientos.
 */

// ─── Helpers privados ────────────────────────────────────────────────────────

function buildCloudinaryUrl(publicId, transformation) {
  return cloudinary.url(publicId, {
    secure: true,
    transformation,
  });
}

async function subirImagenes(files) {
  const imagenesSubidas = [];

  for (const file of files) {
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

  return imagenesSubidas;
}

// ─── Operaciones públicas ────────────────────────────────────────────────────

const crearTratamiento = async (data, files) => {
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
    citaId,
  } = data;

  const serviciosArray =
    typeof servicio === "string" ? servicio.split(",") : servicio;
  const insumosArray =
    typeof insumos === "string" ? insumos.split(",") : insumos;

  if (citaId && !OBJECT_ID_REGEX.test(citaId)) {
    throw new AppError("La cita seleccionada no es válida.", 400);
  }

  let citaReservada = null;
  if (citaId) {
    citaReservada = await citaRepository.marcarComoAtendidaSiPendiente(citaId);

    if (!citaReservada) {
      throw new AppError(
        "La cita ya fue atendida o no está disponible para registrar un tratamiento.",
        409,
      );
    }
  }

  try {
    let imagenesSubidas = [];
    if (files && files.length > 0) {
      imagenesSubidas = await subirImagenes(files);
    }

    const nuevoTratamiento = await tratamientoRepository.create({
      nombre,
      sexo,
      celular,
      servicio: serviciosArray,
      fecha,
      observacion,
      insumos: insumosArray,
      profesional,
      rol,
      cita: citaReservada?._id,
      imagenes: imagenesSubidas,
    });

    if (!citaReservada) {
      await citaRepository.findByClienteAndFecha(nombre, fecha);
    }

    return nuevoTratamiento;
  } catch (error) {
    if (citaReservada && error?.code !== 11000) {
      await citaRepository.restaurarComoPendiente(citaReservada._id);
    }

    if (error?.code === 11000) {
      throw new AppError("Ya existe un tratamiento para esta cita.", 409);
    }

    throw error;
  }
};

const obtenerTratamientos = async () => {
  return tratamientoRepository.findAll();
};

const buscarPaciente = async (nombre) => {
  const nombreLimpio = String(nombre || "").trim().slice(0, 80);
  const escapedNombre = escapeRegex(nombreLimpio);

  const tratamiento = await tratamientoRepository.findByNombreExact(
    escapedNombre,
  );

  if (!tratamiento) {
    throw new AppError("Paciente no encontrado", 404);
  }

  return {
    nombre: tratamiento.nombre,
    sexo: tratamiento.sexo,
    celular: tratamiento.celular,
  };
};

module.exports = {
  crearTratamiento,
  obtenerTratamientos,
  buscarPaciente,
};
