import { NextResponse } from "next/server";
import {
  verifyPassword,
  getSessionToken,
  ADMIN_COOKIE,
  cookieOptions,
} from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
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
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
