import crypto from "crypto";

const encodeBase64Url = (value) => Buffer.from(value, "utf8").toString("base64url");

const decodeBase64Url = (value) => Buffer.from(value, "base64url").toString("utf8");

export const createIdentifier = () => crypto.randomUUID();

export const createPublicConversationToken = () => crypto.randomBytes(32).toString("base64url");

export const hashValue = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");

export const safeCompare = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const signPayload = (payload, secret) =>
  crypto.createHmac("sha256", secret).update(payload).digest("base64url");

export const createAdminSessionToken = (adminUser, secret, ttlMs) => {
  const issuedAt = Date.now();
  const payload = JSON.stringify({
    email: adminUser.email,
    name: adminUser.name,
    iat: issuedAt,
    exp: issuedAt + ttlMs
  });
  const encodedPayload = encodeBase64Url(payload);
  const signature = signPayload(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
};

export const verifyAdminSessionToken = (token, secret) => {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const [encodedPayload, providedSignature] = token.split(".");

  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);

  if (!safeCompare(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload));

    if (!payload || typeof payload !== "object" || typeof payload.exp !== "number") {
      return null;
    }

    if (Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
};
