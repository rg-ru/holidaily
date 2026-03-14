import bcrypt from "bcryptjs";

import { config } from "../config.js";
import {
  createAdminSessionToken,
  safeCompare,
  verifyAdminSessionToken
} from "../utils/crypto.js";
import { HttpError } from "../utils/http-error.js";
import { normalizeEmail } from "../utils/validation.js";

const ADMIN_SESSION_COOKIE = "holidaily_admin_session";

const sanitizeAdminUser = (adminUser) => ({
  email: adminUser.email,
  name: adminUser.name
});

const getConfiguredAdminUser = (email) =>
  config.adminUsers.find((adminUser) => adminUser.email === normalizeEmail(email));

export const readAdminFromRequest = (req) => {
  const sessionToken = req.cookies?.[ADMIN_SESSION_COOKIE];

  if (!sessionToken) {
    return null;
  }

  const payload = verifyAdminSessionToken(sessionToken, config.adminSessionSecret);

  if (!payload || !payload.email) {
    return null;
  }

  const adminUser = getConfiguredAdminUser(payload.email);

  return adminUser ? sanitizeAdminUser(adminUser) : null;
};

export const requireAdmin = (req, res, next) => {
  const adminUser = readAdminFromRequest(req);

  if (!adminUser) {
    return next(new HttpError(401, "Admin-Anmeldung erforderlich."));
  }

  req.adminUser = adminUser;
  return next();
};

export const verifyAdminLogin = ({ email, password }) => {
  const adminUser = getConfiguredAdminUser(email);

  if (!adminUser) {
    return null;
  }

  if (adminUser.passwordHash) {
    return bcrypt.compareSync(password, adminUser.passwordHash)
      ? sanitizeAdminUser(adminUser)
      : null;
  }

  return safeCompare(password, adminUser.password) ? sanitizeAdminUser(adminUser) : null;
};

export const issueAdminSession = (res, adminUser) => {
  // Admin auth uses a signed HttpOnly cookie so the browser never exposes the token to frontend JS.
  const sessionToken = createAdminSessionToken(
    adminUser,
    config.adminSessionSecret,
    config.adminSessionTtlMs
  );

  res.cookie(ADMIN_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    maxAge: config.adminSessionTtlMs
  });
};

export const clearAdminSession = (res) => {
  res.clearCookie(ADMIN_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/"
  });
};
