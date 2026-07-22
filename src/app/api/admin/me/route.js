import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/adminAuth";
import {
  ADMIN_COOKIE,
  cookieOptions,
  createUserSessionToken,
  getAuthFromRequest,
  isFullAdminAuth,
  parseUserSessionToken,
  refreshSessionCookie,
} from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = getAuthFromRequest(request);
  const authenticated = !!auth;

  let body = { authenticated, role: null, user: null, isAdmin: false };

  if (auth?.kind === "legacy-admin") {
    body = {
      authenticated: true,
      role: "ADMIN",
      isAdmin: true,
      user: null,
    };
  } else if (auth?.kind === "user") {
    body = {
      authenticated: true,
      role: auth.role,
      isAdmin: isFullAdminAuth(auth),
      user: {
        id: auth.userId,
        email: auth.email,
        name: auth.name,
        role: auth.role,
      },
    };
  }

  const response = NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });

  if (!authenticated) return response;

  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (auth.kind === "legacy-admin") {
    refreshSessionCookie(response, getSessionToken());
  } else if (token && parseUserSessionToken(token)) {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    if (user?.active) {
      refreshSessionCookie(response, createUserSessionToken(user));
    }
  } else if (token) {
    refreshSessionCookie(response, token);
  }

  return response;
}
