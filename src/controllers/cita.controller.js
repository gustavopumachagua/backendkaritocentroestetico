const Cita = require("../models/Cita.model");
const User = require("../models/User.model");
const Servicio = require("../models/Servicio.model");
const Inventario = require("../models/Inventario.model");

async function validarServiciosPorRol(rol, serviciosArray) {
  if (Servicio) {
    const encontrados = await Servicio.find({
      rol,
      nombre: { $in: serviciosArray },
    }).select("nombre");
    return encontrados.map((s) => s.nombre);
  }

  if (Inventario) {
    const encontrados = await Inventario.find({
      rol,
      tipo: "servicio",
      nombre: { $in: serviciosArray },
    }).select("nombre");
    return encontrados.map((s) => s.nombre);
  }

  return serviciosArray;
}

exports.obtenerCitas = async (req, res) => {
  try {
    const citas = await Cita.find()
      .populate("profesional", "nombre email rol avatar")
      .sort({ fecha: -1 });

    res.json(citas);
  } catch (error) {
    console.error("Error obtener citas:", error);
    res.status(500).json({ message: "Error al obtener citas" });
  }
};

exports.crearCita = async (req, res) => {
  try {
    const { cliente, rol, profesional, servicio, fecha } = req.body;

    if (!cliente || !rol || !profesional || !fecha) {
      return res.status(400).json({
        message:
          "Datos incompletos. cliente, rol, profesional y fecha son requeridos.",
      });
    }

    let profesionalDoc;
    if (/^[0-9a-fA-F]{24}$/.test(profesional)) {
      profesionalDoc = await User.findById(profesional);
    } else {
      profesionalDoc = await User.findOne({
        nombre: profesional,
        rol: rol.toLowerCase(),
      });
    }

    if (!profesionalDoc) {
      return res
        .status(404)
        .json({ message: "Profesional no encontrado para el rol indicado." });
    }

    if (profesionalDoc.rol !== rol.toLowerCase()) {
      return res.status(400).json({
        message: "El profesional no corresponde al rol seleccionado.",
      });
    }

    let serviciosValidos = [];
    if (Array.isArray(servicio) && servicio.length > 0) {
      serviciosValidos = await validarServiciosPorRol(
        rol.toLowerCase(),
        servicio
      );
    }

    const fechaObj = new Date(fecha);
    if (isNaN(fechaObj.getTime())) {
      return res.status(400).json({ message: "Fecha inválida" });
    }

    const nuevaCita = new Cita({
      cliente,
      rol: rol.toLowerCase(),
      profesional: profesionalDoc._id,
      servicio: serviciosValidos.length > 0 ? serviciosValidos : servicio,
      fecha: fechaObj,
    });

    await nuevaCita.save();

    const citaPop = await Cita.findById(nuevaCita._id).populate(
      "profesional",
      "nombre email rol avatar"
    );

    const io = req.app.get("io");
    io.emit("nuevaCita", citaPop);

    res.status(201).json({ message: "Cita creada", cita: citaPop });
  } catch (error) {
    console.error("Error crear cita:", error);
    res.status(500).json({ message: "Error al crear la cita" });
  }
};

exports.actualizarEstadoCita = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    const estadosValidos = ["atendido", "aplazado", "cancelado"];
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    const cita = await Cita.findById(id);
    if (!cita) return res.status(404).json({ message: "Cita no encontrada" });

    if (cita.estado !== "pendiente") {
      return res
        .status(400)
        .json({ message: "El estado solo puede cambiar una vez" });
    }

    cita.estado = estado;
    await cita.save();

    const citaActualizada = await Cita.findById(id).populate(
      "profesional",
      "nombre rol"
    );

    const io = req.app.get("io");
    io.emit("estadoCitaActualizado", citaActualizada);

    res.json({ message: "Estado actualizado", cita: citaActualizada });
  } catch (error) {
    console.error("Error al actualizar estado:", error);
    res.status(500).json({ message: "Error al actualizar estado" });
  }
};
