import { createHmac, timingSafeEqual } from "crypto";
import {
  ADMIN_COOKIE,
  cookieOptions,
  getAdminSecret,
  verifySessionToken,
} from "@/lib/adminAuth";

export { ADMIN_COOKIE, cookieOptions };

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8"
  );
}

function signUserPayload(encodedPayload) {
  return createHmac("sha256", getAdminSecret())
    .update(`user:${encodedPayload}`)
    .digest("hex");
}

export function createUserSessionToken(user) {
  const payload = {
    userId: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    exp: Date.now() + SESSION_MAX_AGE_MS,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = signUserPayload(encoded);
  return `u.${encoded}.${sig}`;
}

export function parseUserSessionToken(token) {
  if (!token || typeof token !== "string" || !token.startsWith("u.")) return null;
  const rest = token.slice(2);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  if (!encoded || !sig) return null;

  const expected = signUserPayload(encoded);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encoded));
  } catch {
    return null;
  }

  if (!payload?.userId || !payload?.role || !payload?.exp) return null;
  if (Date.now() > payload.exp) return null;

  return {
    kind: "user",
    userId: payload.userId,
    role: payload.role,
    email: payload.email || "",
    name: payload.name || "",
  };
}

/** @returns {{ kind: 'legacy-admin' } | { kind: 'user', userId: string, role: string, email: string, name: string } | null} */
export function getAuthFromRequest(request) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  if (verifySessionToken(token)) {
    return { kind: "legacy-admin" };
  }
  return parseUserSessionToken(token);
}

export function isAuthenticatedRequest(request) {
  return !!getAuthFromRequest(request);
}

export function isFullAdminAuth(auth) {
  if (!auth) return false;
  if (auth.kind === "legacy-admin") return true;
  return auth.kind === "user" && auth.role === "ADMIN";
}

export function refreshSessionCookie(response, token) {
  if (token) {
    response.cookies.set(ADMIN_COOKIE, token, cookieOptions);
  }
}
