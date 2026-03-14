import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { HttpError } from "./utils/http-error.js";
import { normalizeEmail } from "./utils/validation.js";

dotenv.config();

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(CONFIG_DIR, "..");

const parseBoolean = (value, fallback = false) => {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().toLowerCase() === "true";
};

const parseNumber = (value, fallback) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const createAdminUser = (entry) => {
  const email = normalizeEmail(entry?.email);
  const name = String(entry?.name || "").trim() || "Support Admin";
  const password = String(entry?.password || "").trim();
  const passwordHash = String(entry?.passwordHash || "").trim();

  if (!email) {
    throw new HttpError(500, "Mindestens ein Admin benötigt eine gueltige E-Mail-Adresse.");
  }

  if (!password && !passwordHash) {
    throw new HttpError(
      500,
      `Der Admin ${email} benötigt entweder ein password oder ein passwordHash Feld.`
    );
  }

  return {
    email,
    name,
    password,
    passwordHash
  };
};

const parseAdminUsers = () => {
  const adminUsersJson = String(process.env.ADMIN_USERS_JSON || "").trim();

  if (adminUsersJson) {
    try {
      const parsedUsers = JSON.parse(adminUsersJson);

      if (!Array.isArray(parsedUsers) || !parsedUsers.length) {
        throw new Error("ADMIN_USERS_JSON must be a non-empty array.");
      }

      return parsedUsers.map((entry) => createAdminUser(entry));
    } catch (error) {
      throw new HttpError(500, "ADMIN_USERS_JSON konnte nicht gelesen werden.");
    }
  }

  const singleAdminEmail = normalizeEmail(process.env.ADMIN_EMAIL || "");
  const singleAdminPassword = String(process.env.ADMIN_PASSWORD || "").trim();
  const singleAdminPasswordHash = String(process.env.ADMIN_PASSWORD_HASH || "").trim();

  if (!singleAdminEmail || (!singleAdminPassword && !singleAdminPasswordHash)) {
    return [];
  }

  return [
    createAdminUser({
      email: singleAdminEmail,
      name: process.env.ADMIN_NAME,
      password: singleAdminPassword,
      passwordHash: singleAdminPasswordHash
    })
  ];
};

const adminUsers = parseAdminUsers();
const adminSessionSecret = String(process.env.ADMIN_SESSION_SECRET || "").trim();

if (!adminUsers.length) {
  throw new HttpError(
    500,
    "Es wurde kein Admin konfiguriert. Bitte .env nach .env.example einrichten."
  );
}

if (adminSessionSecret.length < 32) {
  throw new HttpError(
    500,
    "ADMIN_SESSION_SECRET muss mindestens 32 Zeichen lang sein."
  );
}

export const config = {
  projectRoot: PROJECT_ROOT,
  port: parseNumber(process.env.PORT, 3000),
  isProduction: String(process.env.NODE_ENV || "").trim() === "production",
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  chatDbPath: path.resolve(PROJECT_ROOT, process.env.CHAT_DB_PATH || "data/chat-support.sqlite"),
  adminUsers,
  adminSessionSecret,
  adminSessionTtlMs: parseNumber(process.env.ADMIN_SESSION_TTL_HOURS, 12) * 60 * 60 * 1000
};
