const fs = require("fs");

/**
 * Elimina un archivo local de forma asíncrona.
 * Si la eliminación falla, registra una advertencia sin lanzar error.
 *
 * @param {string} filePath — Ruta del archivo a eliminar.
 */
const deleteLocalFile = (filePath) => {
  if (!filePath) return;

  fs.promises.unlink(filePath).catch((error) => {
    console.warn("No se pudo eliminar el archivo temporal:", error.message);
  });
};

module.exports = { deleteLocalFile };
