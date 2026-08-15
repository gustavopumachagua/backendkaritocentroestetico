/**
 * Middleware factory de autorización por rol.
 *
 * Uso en rutas:
 *   router.post("/", authMiddleware, authorizeRole("administrador"), handler);
 *
 * @param  {...string} allowedRoles — Roles permitidos para acceder al recurso.
 * @returns {Function}              — Middleware de Express.
 */
const authorizeRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({ message: "No autorizado" });
    }

    next();
  };
};

module.exports = authorizeRole;
