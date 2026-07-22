import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { matchDetailInclude } from "@/lib/matchState";
import {
  casErrorResponse,
  casUpdateMatch,
  parseExpectedVersion,
  parseLockToken,
  assertWritableLock,
} from "@/lib/matchCas";
import { requireMatchAccess } from "@/lib/accessControl";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/matches/[id]/awards
 * Body: { manOfTheMatchId?: string|null, bestFielderId?: string|null }
 */
export async function PATCH(request, { params }) {
  const { id: matchId } = await params;
  const gate = await requireMatchAccess(request, matchId);
  if (gate.error) return gate.error;

  try {
    const body = await request.json();
    const expectedVersion = parseExpectedVersion(body);
    const lockToken = parseLockToken(body);

    const hasMom = Object.prototype.hasOwnProperty.call(body, "manOfTheMatchId");
    const hasFielder = Object.prototype.hasOwnProperty.call(body, "bestFielderId");
    if (!hasMom && !hasFielder) {
      return NextResponse.json(
        { error: "Provide manOfTheMatchId and/or bestFielderId" },
        { status: 400 }
      );
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { players: { select: { id: true } } } },
        teamB: { include: { players: { select: { id: true } } } },
      },
    });
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    assertWritableLock(match, lockToken);

    const allowed = new Set([
      ...(match.teamA?.players || []).map((p) => p.id),
      ...(match.teamB?.players || []).map((p) => p.id),
    ]);

    const data = {};
    if (hasMom) {
      const id = body.manOfTheMatchId || null;
      if (id && !allowed.has(id)) {
        return NextResponse.json(
          { error: "Man of the Match must be a player from this match" },
          { status: 400 }
        );
      }
      data.manOfTheMatchId = id;
    }
    if (hasFielder) {
      const id = body.bestFielderId || null;
      if (id && !allowed.has(id)) {
        return NextResponse.json(
          { error: "Best Fielder must be a player from this match" },
          { status: 400 }
        );
      }
      data.bestFielderId = id;
    }

    await casUpdateMatch(prisma, matchId, { expectedVersion, data });

    const updated = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        ...matchDetailInclude,
        manOfTheMatch: {
          select: { id: true, name: true, shirtNumber: true, logoUrl: true, teamId: true },
        },
        bestFielder: {
          select: { id: true, name: true, shirtNumber: true, logoUrl: true, teamId: true },
        },
      },
    });

    return NextResponse.json(updated, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (err) {
    const casRes = casErrorResponse(err);
    if (casRes) return casRes;
    console.error("awards PATCH error:", err);
    return NextResponse.json({ error: "Failed to save awards" }, { status: 500 });
  }
}
