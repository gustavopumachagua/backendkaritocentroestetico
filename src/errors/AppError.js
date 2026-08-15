/**
 * Error personalizado de la aplicación.
 *
 * Permite lanzar errores con un código HTTP desde cualquier capa
 * (Service, Repository) sin acoplar esas capas a Express.
 * El errorHandler central traduce estos errores a respuestas HTTP.
 */
class AppError extends Error {
  /**
   * @param {string} message  — Mensaje descriptivo del error.
   * @param {number} statusCode — Código HTTP (400, 404, 500, etc.).
   */
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
