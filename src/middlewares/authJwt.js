const jwt = require("jsonwebtoken");
const userRepository = require("../repositories/user.repository");

async function authJwt(req, res, next) {
  const authorization = req.headers.authorization;
  const [scheme, token, ...extraParts] = String(authorization || "")
    .trim()
    .split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extraParts.length > 0) {
    return res.status(401).json({ message: "Token requerido" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userRepository.findById(
      decoded.id,
      "activo passwordChangedAt rol nombre",
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

    // The database is authoritative for permissions. A role change or
    // suspension is therefore effective immediately instead of waiting for a
    // previously-issued JWT to expire.
    req.user = {
      id: String(user._id),
      rol: user.rol,
      nombre: user.nombre,
    };
    return next();
  } catch (err) {
    return res.status(403).json({ message: "Token inválido" });
  }
}

module.exports = authJwt;
