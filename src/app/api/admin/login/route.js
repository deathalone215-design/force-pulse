import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertProductionSecrets,
} from "@/lib/adminAuth";
import {
  ADMIN_COOKIE,
  cookieOptions,
  createUserSessionToken,
} from "@/lib/session";
import { verifyPassword as verifyUserPassword } from "@/lib/password";
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
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = body.password;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        passwordHash: true,
      },
    });

    if (!user || !user.active) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await verifyUserPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = createUserSessionToken(user);
    const response = NextResponse.json({
      ok: true,
      role: user.role,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
    response.cookies.set(ADMIN_COOKIE, token, cookieOptions);
    return response;
  } catch (error) {
    console.error("Admin login failed:", error);
    const msg = String(error?.message || "");
    if (msg.includes("ADMIN_")) {
      return NextResponse.json(
        { error: "Admin auth is not configured" },
        { status: 503 }
      );
    }
    if (error?.code === "P2021" || msg.includes('"User"')) {
      return NextResponse.json(
        { error: "Account system not ready. Run database migration on the server." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
