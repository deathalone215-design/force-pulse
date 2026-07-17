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

async function verifySessionToken(token) {
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
  const isAuthed = await verifySessionToken(token);

  // Admin tournament tools require a session; public / and /live do not
  if (pathname.startsWith("/tournaments")) {
    if (!isAuthed) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    // Refresh session cookie on each admin navigation so refresh / public visits don't drop it
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
      pathname.startsWith("/api/upload");

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
  ],
};
