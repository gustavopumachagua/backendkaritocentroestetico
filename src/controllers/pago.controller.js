const Cita = require("../models/Cita.model");
const Pago = require("../models/Pago.model");

exports.registrarPago = async (req, res) => {
  try {
    const { citaId, cliente, servicios, metodoPago, total, fecha } = req.body;

    if (
      !citaId ||
      !cliente ||
      !servicios ||
      !metodoPago ||
      total == null ||
      !fecha
    ) {
      return res.status(400).json({ message: "Datos incompletos." });
    }

    if (!Array.isArray(servicios) || servicios.length === 0) {
      return res
        .status(400)
        .json({ message: "La lista de servicios está vacía." });
    }

    for (const s of servicios) {
      if (s.precio == null || isNaN(s.precio) || Number(s.precio) <= 0) {
        return res.status(400).json({
          message: "Cada servicio debe tener un precio numérico mayor a 0.",
        });
      }
    }

    const sumaCalc = servicios.reduce((acc, s) => acc + Number(s.precio), 0);
    if (Number(total) !== Number(sumaCalc)) {
      return res.status(400).json({
        message:
          "El total no coincide con la suma de los precios de los servicios.",
      });
    }

    const cita = await Cita.findById(citaId);
    if (!cita) {
      return res.status(404).json({ message: "Cita no encontrada" });
    }

    const pagoExistente = await Pago.findOne({ cita: citaId });
    if (pagoExistente) {
      return res
        .status(400)
        .json({ message: "Ya existe un pago registrado para esta cita." });
    }

    if (cita.estado === "cancelado") {
      return res.status(400).json({
        message: "Esta cita ya fue cancelada y no puede modificarse.",
      });
    }

    const nuevoPago = new Pago({
      cita: citaId,
      cliente,
      servicios,
      metodoPago,
      total,
      fecha,
      estadoPago: "pagado",
    });
    await nuevoPago.save();

    const io = req.app.get("io");
    io.emit("nuevoPago", nuevoPago);

    res.status(201).json({
      message: "Pago registrado y cita actualizada a cancelado",
      pago: nuevoPago,
    });
  } catch (error) {
    console.error("Error registrando pago:", error);
    res.status(500).json({ message: "Error al registrar el pago" });
  }
};

exports.obtenerPagos = async (req, res) => {
  try {
    const pagos = await Pago.find()
      .populate({
        path: "cita",
        select: "cliente fecha estado profesional",
        populate: {
          path: "profesional",
          select: "nombre rol",
        },
      })
      .sort({ fecha: -1 });

    res.json(pagos);
  } catch (error) {
    console.error("Error al obtener pagos:", error);
    res.status(500).json({ message: "Error al obtener pagos" });
  }
};

exports.obtenerPagosPorCita = async (req, res) => {
  try {
    const { citaId } = req.params;
    const pagos = await Pago.find({ cita: citaId });
    res.json(pagos);
  } catch (error) {
    console.error("Error al obtener pagos de la cita:", error);
    res.status(500).json({ message: "Error al obtener pagos de la cita" });
  }
};
