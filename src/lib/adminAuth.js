import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE = "md_admin_session";

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "admin";
}

export function getAdminSecret() {
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
