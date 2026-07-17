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

const cricketMatchInclude = {
  cricketBalls: { orderBy: { createdAt: "asc" } },
  teamA: { include: { players: true } },
  teamB: { include: { players: true } },
};

export async function POST(request, { params }) {
  try {
    const { id: matchId } = await params;
    const body = await request.json();
    const { battingTeamId, strikerId, nonStrikerId, bowlerId } = body;
    const expectedVersion = parseExpectedVersion(body);
    const lockToken = parseLockToken(body);

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        round: {
          include: {
            category: { include: { tournament: true } },
          },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    assertWritableLock(match, lockToken);

    const category = match.round?.category;
    if (category?.sport !== "CRICKET") {
      return NextResponse.json({ error: "Not a cricket match" }, { status: 400 });
    }

    if (match.status === "COMPLETED") {
      return NextResponse.json({ error: "Match already completed" }, { status: 400 });
    }

    const resolved = await findResolvedMatch(matchId);
    const teamAId = resolved?.teamAId || match.teamAId;
    const teamBId = resolved?.teamBId || match.teamBId;

    if (battingTeamId !== teamAId && battingTeamId !== teamBId) {
      return NextResponse.json({ error: "Invalid batting team" }, { status: 400 });
    }
    if (!strikerId || !nonStrikerId || !bowlerId) {
      return NextResponse.json(
        { error: "Select openers and opening bowler" },
        { status: 400 }
      );
    }
    if (strikerId === nonStrikerId) {
      return NextResponse.json(
        { error: "Striker and non-striker must be different" },
        { status: 400 }
      );
    }

    const oversLimit = match.oversLimit || category.oversPerInnings || null;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.cricketBall.deleteMany({ where: { matchId } });
      return casUpdateMatch(tx, matchId, {
        expectedVersion,
        data: {
          status: "LIVE",
          oversLimit,
          currentInnings: 1,
          inningsComplete: 0,
          battingTeamId,
          strikerId,
          nonStrikerId,
          bowlerId,
          scoreA: 0,
          scoreB: 0,
          wicketsA: 0,
          wicketsB: 0,
          ballsFacedA: 0,
          ballsFacedB: 0,
        },
        include: cricketMatchInclude,
      });
    });

    return NextResponse.json({ match: updated });
  } catch (error) {
    const casRes = casErrorResponse(error);
    if (casRes) return casRes;
    console.error("Failed to start cricket match:", error);
    return NextResponse.json({ error: "Failed to start match" }, { status: 500 });
  }
}
