import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { findResolvedMatch } from "@/lib/tournamentData";

export async function POST(request, { params }) {
  try {
    const { id: matchId } = await params;
    const body = await request.json();
    const { strikerId, nonStrikerId, bowlerId } = body;

    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
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

    const updated = await prisma.match.update({
      where: { id: matchId },
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
    console.error("Failed to start second innings:", error);
    return NextResponse.json({ error: "Failed to start innings" }, { status: 500 });
  }
}
