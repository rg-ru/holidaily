import { HttpError } from "./http-error.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set(["open", "answered", "closed"]);

const sanitizePlainText = (value) =>
  String(value || "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .trim();

const sanitizeMultilineText = (value) =>
  String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

export const normalizeEmail = (value) => sanitizePlainText(value).toLowerCase();

export const validateConversationId = (value) => {
  const normalizedValue = sanitizePlainText(value);

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new HttpError(400, "Die Konversations-ID ist ungueltig.");
  }

  return normalizedValue;
};

export const validateOptionalName = (value) => {
  const normalizedValue = sanitizePlainText(value);

  if (normalizedValue.length > 120) {
    throw new HttpError(400, "Der Name darf maximal 120 Zeichen haben.");
  }

  return normalizedValue;
};

export const validateOptionalEmail = (value) => {
  const normalizedValue = normalizeEmail(value);

  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.length > 255 || !EMAIL_PATTERN.test(normalizedValue)) {
    throw new HttpError(400, "Die E-Mail-Adresse ist ungueltig.");
  }

  return normalizedValue;
};

export const validateMessageBody = (value) => {
  const normalizedValue = sanitizeMultilineText(value);

  if (!normalizedValue) {
    throw new HttpError(400, "Die Nachricht darf nicht leer sein.");
  }

  if (normalizedValue.length > 2000) {
    throw new HttpError(400, "Die Nachricht darf maximal 2000 Zeichen haben.");
  }

  return normalizedValue;
};

export const validateSearchTerm = (value) => {
  const normalizedValue = sanitizePlainText(value);

  if (normalizedValue.length > 120) {
    throw new HttpError(400, "Die Suche darf maximal 120 Zeichen haben.");
  }

  return normalizedValue;
};

export const validateConversationStatus = (value) => {
  const normalizedValue = sanitizePlainText(value).toLowerCase();

  if (!VALID_STATUSES.has(normalizedValue)) {
    throw new HttpError(400, "Der Status ist ungueltig.");
  }

  return normalizedValue;
};

export const validateAdminCredentials = (payload) => {
  const email = validateOptionalEmail(payload?.email);
  const password = sanitizePlainText(payload?.password);

  if (!email || !password) {
    throw new HttpError(400, "Bitte Admin-E-Mail und Passwort angeben.");
  }

  return {
    email,
    password
  };
};
