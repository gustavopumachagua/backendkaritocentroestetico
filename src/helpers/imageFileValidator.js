const fs = require("fs/promises");
const AppError = require("../errors/AppError");

const HEADER_LENGTH = 12;

function isJpeg(header) {
  return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
}

function isPng(header) {
  return (
    header.length >= 8 &&
    header.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  );
}

function isWebp(header) {
  return (
    header.length >= HEADER_LENGTH &&
    header.subarray(0, 4).toString("ascii") === "RIFF" &&
    header.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function hasAllowedImageSignature(header) {
  return isJpeg(header) || isPng(header) || isWebp(header);
}

async function readFileHeader(filePath) {
  const handle = await fs.open(filePath, "r");
  const header = Buffer.alloc(HEADER_LENGTH);

  try {
    const { bytesRead } = await handle.read(header, 0, HEADER_LENGTH, 0);
    return header.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * MIME headers are supplied by the browser and can be forged. This validates
 * the file signature after Multer writes its temporary file and before any
 * remote upload occurs.
 */
async function validateImageFile(file) {
  if (!file?.path) {
    throw new AppError("Archivo de imagen inválido", 400);
  }

  const header = await readFileHeader(file.path);
  if (!hasAllowedImageSignature(header)) {
    throw new AppError("El contenido del archivo no corresponde a una imagen permitida", 400);
  }
}

async function validateImageFiles(files = []) {
  for (const file of files) {
    await validateImageFile(file);
  }
}

module.exports = {
  hasAllowedImageSignature,
  validateImageFile,
  validateImageFiles,
};
