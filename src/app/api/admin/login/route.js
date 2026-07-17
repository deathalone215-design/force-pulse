import { NextResponse } from "next/server";
import {
  assertProductionSecrets,
  verifyPassword,
  getSessionToken,
  ADMIN_COOKIE,
  cookieOptions,
} from "@/lib/adminAuth";
import { clientIpFromRequest, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    assertProductionSecrets();

    const ip = clientIpFromRequest(request);
    const limited = rateLimit(`admin-login:${ip}`, {
      limit: 8,
      windowMs: 60_000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        }
      );
    }

    const body = await request.json();
    const { password } = body;

    if (!verifyPassword(password)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, getSessionToken(), cookieOptions);
    return response;
  } catch (error) {
    console.error("Admin login failed:", error);
    const message =
      process.env.NODE_ENV === "production" &&
      String(error?.message || "").includes("ADMIN_")
        ? "Admin auth is not configured"
        : "Login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
