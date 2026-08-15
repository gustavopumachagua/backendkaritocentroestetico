/**
 * Envuelve un handler async de Express para que cualquier error
 * rechazado se propague automáticamente al middleware errorHandler.
 *
 * Elimina la necesidad de escribir try/catch en cada controller.
 *
 * @param {Function} fn — Handler async (req, res, next) => Promise<void>
 * @returns {Function}  — Handler compatible con Express.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
