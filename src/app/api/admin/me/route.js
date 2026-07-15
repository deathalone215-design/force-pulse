import { NextResponse } from "next/server";
import {
  isAdminRequest,
  getSessionToken,
  ADMIN_COOKIE,
  cookieOptions,
} from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const authenticated = isAdminRequest(request);
  const response = NextResponse.json(
    { authenticated },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    }
  );

  // Keep the session cookie alive while admin keeps using the app
  if (authenticated) {
    response.cookies.set(ADMIN_COOKIE, getSessionToken(), cookieOptions);
  }

  return response;
}
