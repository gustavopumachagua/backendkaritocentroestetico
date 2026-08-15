/**
 * Constantes del sistema.
 * Centraliza valores que antes estaban dispersos como "magic strings/numbers".
 */

// ─── Auth ────────────────────────────────────────────────────────────────────
const RESET_TOKEN_PURPOSE = "password-reset";
const RESET_TOKEN_EXPIRES_IN = "30m";
const LOGIN_TOKEN_EXPIRES_IN = "1d";
const MIN_PASSWORD_LENGTH = 6;

// ─── Citas ───────────────────────────────────────────────────────────────────
const ESTADOS_CITA_VALIDOS = ["atendido", "aplazado", "cancelado"];
const ESTADO_CITA_PENDIENTE = "pendiente";

// ─── Pagos ───────────────────────────────────────────────────────────────────
const NUMERO_BOLETA_INICIAL = 224;
const SERIE_BOLETA = "BA01";

// ─── Populate Fields ─────────────────────────────────────────────────────────
const PROFESIONAL_FIELDS = "nombre email rol avatar";
const PROFESIONAL_FIELDS_MINIMAL = "nombre rol";

// ─── ObjectId ────────────────────────────────────────────────────────────────
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

module.exports = {
  RESET_TOKEN_PURPOSE,
  RESET_TOKEN_EXPIRES_IN,
  LOGIN_TOKEN_EXPIRES_IN,
  MIN_PASSWORD_LENGTH,
  ESTADOS_CITA_VALIDOS,
  ESTADO_CITA_PENDIENTE,
  NUMERO_BOLETA_INICIAL,
  SERIE_BOLETA,
  PROFESIONAL_FIELDS,
  PROFESIONAL_FIELDS_MINIMAL,
  OBJECT_ID_REGEX,
};
