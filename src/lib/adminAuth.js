import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE = "md_admin_session";

const INSECURE_PASSWORDS = new Set(["admin", "password", "123456", "changeme"]);
const INSECURE_SECRETS = new Set([
  "matchday-dev-secret",
  "change-me-in-production",
  "secret",
  "dev",
]);

function isProduction() {
  return process.env.NODE_ENV === "production";
}

/** True when env is missing or still a known insecure default. */
export function hasInsecureAdminConfig() {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SECRET;
  if (!password || !secret) return true;
  if (INSECURE_PASSWORDS.has(password.toLowerCase())) return true;
  if (INSECURE_SECRETS.has(secret.toLowerCase())) return true;
  if (secret.length < 16) return true;
  return false;
}

/**
 * Fail closed in production if admin credentials are missing/weak.
 * Safe to call at boot (instrumentation) and on login.
 */
export function assertProductionSecrets() {
  if (!isProduction()) return;
  if (!hasInsecureAdminConfig()) return;
  throw new Error(
    "Refusing to start: set strong ADMIN_PASSWORD and ADMIN_SECRET in production (secret ≥ 16 chars, not a known default)."
  );
}

export function getAdminPassword() {
  if (isProduction() && hasInsecureAdminConfig()) {
    throw new Error("ADMIN_PASSWORD / ADMIN_SECRET are not configured for production");
  }
  return process.env.ADMIN_PASSWORD || "admin";
}

export function getAdminSecret() {
  if (isProduction() && hasInsecureAdminConfig()) {
    throw new Error("ADMIN_PASSWORD / ADMIN_SECRET are not configured for production");
  }
  return process.env.ADMIN_SECRET || "matchday-dev-secret";
}

export function getSessionToken() {
  return createHmac("sha256", getAdminSecret())
    .update(`admin:${getAdminPassword()}`)
    .digest("hex");
}

export function verifyPassword(password) {
  const expected = getAdminPassword();
  if (!password || typeof password !== "string") return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string") return false;
  const expected = getSessionToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isAdminRequest(request) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  return verifySessionToken(token);
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  // 30 days — stays logged in across refresh & public-page visits
  maxAge: 60 * 60 * 24 * 30,
  secure: process.env.NODE_ENV === "production",
};
