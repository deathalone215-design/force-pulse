import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromRequest, isFullAdminAuth } from "@/lib/session";

export async function userCanAccessTournament(auth, tournamentId) {
  if (!auth || !tournamentId) return false;
  if (isFullAdminAuth(auth)) return true;
  if (auth.kind !== "user" || auth.role !== "MANAGER") return false;

  const assignment = await prisma.tournamentAssignment.findUnique({
    where: {
      userId_tournamentId: {
        userId: auth.userId,
        tournamentId,
      },
    },
  });
  return !!assignment;
}

export async function requireAuth(request) {
  let auth;
  try {
    auth = getAuthFromRequest(request);
  } catch (error) {
    console.error("Auth check failed:", error);
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!auth) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { auth };
}

export async function requireFullAdmin(request) {
  const result = await requireAuth(request);
  if (result.error) return result;
  if (!isFullAdminAuth(result.auth)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return result;
}

export async function requireTournamentAccess(request, tournamentId) {
  const result = await requireAuth(request);
  if (result.error) return result;
  const allowed = await userCanAccessTournament(result.auth, tournamentId);
  if (!allowed) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return result;
}

export async function getTournamentIdForMatch(matchId) {
  const row = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      round: {
        select: {
          category: {
            select: { tournamentId: true },
          },
        },
      },
    },
  });
  return row?.round?.category?.tournamentId ?? null;
}

export async function requireMatchAccess(request, matchId) {
  const tournamentId = await getTournamentIdForMatch(matchId);
  if (!tournamentId) {
    return {
      error: NextResponse.json({ error: "Match not found" }, { status: 404 }),
    };
  }
  return requireTournamentAccess(request, tournamentId);
}
