import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/** PATCH: set new batsman after wicket and/or change bowler */
export async function PATCH(request, { params }) {
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

    const data = {};
    if (strikerId !== undefined) data.strikerId = strikerId || null;
    if (nonStrikerId !== undefined) data.nonStrikerId = nonStrikerId || null;
    if (bowlerId !== undefined) data.bowlerId = bowlerId || null;

    if (data.strikerId && data.nonStrikerId && data.strikerId === data.nonStrikerId) {
      return NextResponse.json(
        { error: "Striker and non-striker must be different" },
        { status: 400 }
      );
    }

    const updated = await prisma.match.update({
      where: { id: matchId },
      data,
      include: {
        cricketBalls: { orderBy: { createdAt: "asc" } },
        teamA: { include: { players: true } },
        teamB: { include: { players: true } },
      },
    });

    return NextResponse.json({ match: updated });
  } catch (error) {
    console.error("Failed to update cricket players:", error);
    return NextResponse.json({ error: "Failed to update players" }, { status: 500 });
  }
}
