const jwt = require("jsonwebtoken");
const User = require("../models/User.model");

async function authJwt(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Token requerido" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select(
      "activo passwordChangedAt",
    );

    if (!user) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }

    if (!user.activo) {
      return res.status(403).json({ message: "Usuario suspendido" });
    }

    const tokenIssuedAt = decoded.iat ? decoded.iat * 1000 : 0;
    if (
      user.passwordChangedAt &&
      tokenIssuedAt < user.passwordChangedAt.getTime()
    ) {
      return res.status(401).json({
        message: "La contraseña cambió recientemente. Inicia sesión de nuevo",
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Token inválido" });
  }
}

module.exports = authJwt;
