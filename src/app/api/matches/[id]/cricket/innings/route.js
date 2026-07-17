import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { findResolvedMatch } from "@/lib/tournamentData";
import {
  assertWritableLock,
  casErrorResponse,
  casUpdateMatch,
  parseExpectedVersion,
  parseLockToken,
} from "@/lib/matchCas";

export async function POST(request, { params }) {
  try {
    const { id: matchId } = await params;
    const body = await request.json();
    const { strikerId, nonStrikerId, bowlerId } = body;
    const expectedVersion = parseExpectedVersion(body);
    const lockToken = parseLockToken(body);

    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    assertWritableLock(match, lockToken);
    if (match.status !== "LIVE") {
      return NextResponse.json({ error: "Match is not live" }, { status: 400 });
    }
    if (match.currentInnings !== 1 || match.inningsComplete < 1) {
      return NextResponse.json(
        { error: "First innings is not complete yet" },
        { status: 400 }
      );
    }
    if (!strikerId || !nonStrikerId || !bowlerId) {
      return NextResponse.json(
        { error: "Select openers and opening bowler for the chase" },
        { status: 400 }
      );
    }
    if (strikerId === nonStrikerId) {
      return NextResponse.json(
        { error: "Striker and non-striker must be different" },
        { status: 400 }
      );
    }

    const resolved = await findResolvedMatch(matchId);
    const teamAId = resolved?.teamAId || match.teamAId;
    const teamBId = resolved?.teamBId || match.teamBId;
    const chasingTeamId =
      match.battingTeamId === teamAId ? teamBId : teamAId;

    const updated = await casUpdateMatch(prisma, matchId, {
      expectedVersion,
      data: {
        currentInnings: 2,
        battingTeamId: chasingTeamId,
        strikerId,
        nonStrikerId,
        bowlerId,
      },
      include: {
        cricketBalls: { orderBy: { createdAt: "asc" } },
        teamA: { include: { players: true } },
        teamB: { include: { players: true } },
      },
    });

    return NextResponse.json({ match: updated });
  } catch (error) {
    const casRes = casErrorResponse(error);
    if (casRes) return casRes;
    console.error("Failed to start second innings:", error);
    return NextResponse.json({ error: "Failed to start innings" }, { status: 500 });
  }
}
