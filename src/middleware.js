import { NextResponse } from "next/server";

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

function hasInsecureAdminConfig() {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SECRET;
  if (!password || !secret) return true;
  if (INSECURE_PASSWORDS.has(password.toLowerCase())) return true;
  if (INSECURE_SECRETS.has(secret.toLowerCase())) return true;
  if (secret.length < 16) return true;
  return false;
}

function getAdminPassword() {
  if (isProduction() && hasInsecureAdminConfig()) return null;
  return process.env.ADMIN_PASSWORD || "admin";
}

function getAdminSecret() {
  if (isProduction() && hasInsecureAdminConfig()) return null;
  return process.env.ADMIN_SECRET || "matchday-dev-secret";
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyLegacyAdminToken(token) {
  if (!token) return false;
  const secret = getAdminSecret();
  const password = getAdminPassword();
  if (!secret || !password) return false;
  const expected = await hmacHex(secret, `admin:${password}`);
  if (token.length !== expected.length) return false;
  let ok = true;
  for (let i = 0; i < token.length; i++) {
    if (token.charCodeAt(i) !== expected.charCodeAt(i)) ok = false;
  }
  return ok;
}

function base64UrlDecode(value) {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function verifyUserSessionToken(token) {
  if (!token || !token.startsWith("u.")) return false;
  const secret = getAdminSecret();
  if (!secret) return false;

  const rest = token.slice(2);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return false;
  const encoded = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  if (!encoded || !sig) return false;

  const expected = await hmacHex(secret, `user:${encoded}`);
  if (sig.length !== expected.length) return false;
  let ok = true;
  for (let i = 0; i < sig.length; i++) {
    if (sig.charCodeAt(i) !== expected.charCodeAt(i)) ok = false;
  }
  if (!ok) return false;

  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (!payload?.userId || !payload?.role || !payload?.exp) return false;
    return Date.now() <= payload.exp;
  } catch {
    return false;
  }
}

async function isAuthenticated(token) {
  if (!token) return false;
  if (await verifyLegacyAdminToken(token)) return true;
  return verifyUserSessionToken(token);
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (isProduction() && hasInsecureAdminConfig()) {
    const method = request.method.toUpperCase();
    const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    if (pathname.startsWith("/tournaments") || isMutating) {
      return NextResponse.json(
        { error: "Admin auth is not configured for production" },
        { status: 503 }
      );
    }
  }

  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  const isAuthed = await isAuthenticated(token);

  if (pathname.startsWith("/tournaments")) {
    if (!isAuthed) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    const res = NextResponse.next();
    res.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  }

  const method = request.method.toUpperCase();
  const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  if (isMutating) {
    const isProtectedApi =
      pathname.startsWith("/api/tournaments") ||
      pathname.startsWith("/api/matches") ||
      pathname.startsWith("/api/upload") ||
      pathname.startsWith("/api/admin/users");

    if (isProtectedApi && !isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/tournaments/:path*",
    "/api/tournaments/:path*",
    "/api/matches/:path*",
    "/api/upload",
    "/api/admin/users",
    "/api/admin/users/:path*",
  ],
};
