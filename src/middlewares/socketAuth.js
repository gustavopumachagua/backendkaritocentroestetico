const jwt = require("jsonwebtoken");
const userRepository = require("../repositories/user.repository");

function getSocketToken(socket) {
  const token = socket.handshake.auth?.token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

/**
 * Applies the same account-state checks used by the HTTP API before a socket
 * joins the realtime channel. This prevents anonymous clients from receiving
 * appointment, payment, treatment or clinical-history broadcasts.
 */
async function socketAuth(socket, next) {
  const token = getSocketToken(socket);
  if (!token) return next(new Error("No autorizado"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userRepository.findById(
      decoded.id,
      "activo passwordChangedAt rol nombre",
    );

    if (!user || !user.activo) {
      return next(new Error("No autorizado"));
    }

    const tokenIssuedAt = decoded.iat ? decoded.iat * 1000 : 0;
    if (user.passwordChangedAt && tokenIssuedAt < user.passwordChangedAt.getTime()) {
      return next(new Error("No autorizado"));
    }

    socket.user = {
      id: String(user._id),
      rol: user.rol,
      nombre: user.nombre,
    };
    return next();
  } catch {
    return next(new Error("No autorizado"));
  }
}

module.exports = socketAuth;
