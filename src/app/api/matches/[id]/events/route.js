import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { findResolvedMatch } from "@/lib/tournamentData";

export async function POST(request, { params }) {
  try {
    const { id: matchId } = await params;
    const body = await request.json();
    const { type, teamId, playerId, minute } = body;

    if (!type) {
      return NextResponse.json({ error: "Event type is required" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const resolvedMatch = await findResolvedMatch(matchId);
    const teamAId = resolvedMatch ? resolvedMatch.teamAId : match.teamAId;
    const teamBId = resolvedMatch ? resolvedMatch.teamBId : match.teamBId;

    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.matchEvent.create({
        data: {
          matchId,
          teamId,
          playerId,
          type,
          minute: minute ? parseInt(minute, 10) : null,
        },
        include: {
          player: true,
        },
      });

      let newScoreA = match.scoreA;
      let newScoreB = match.scoreB;

      if (type === "GOAL") {
        if (teamId === teamAId) {
          newScoreA += 1;
        } else if (teamId === teamBId) {
          newScoreB += 1;
        }
      } else if (type === "OWN_GOAL") {
        if (teamId === teamAId) {
          newScoreB += 1;
        } else if (teamId === teamBId) {
          newScoreA += 1;
        }
      }

      const updatedMatch = await tx.match.update({
        where: { id: matchId },
        data: {
          scoreA: newScoreA,
          scoreB: newScoreB,
        },
      });

      return { event, match: updatedMatch };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to add match event:", error);
    return NextResponse.json({ error: "Failed to add match event" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id: matchId } = await params;
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");

    if (!eventId) {
      return NextResponse.json({ error: "Event ID is required" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
    });

    const event = await prisma.matchEvent.findUnique({
      where: { id: eventId },
    });

    if (!match || !event) {
      return NextResponse.json({ error: "Match or Event not found" }, { status: 404 });
    }

    const resolvedMatch = await findResolvedMatch(matchId);
    const teamAId = resolvedMatch ? resolvedMatch.teamAId : match.teamAId;
    const teamBId = resolvedMatch ? resolvedMatch.teamBId : match.teamBId;

    const result = await prisma.$transaction(async (tx) => {
      await tx.matchEvent.delete({
        where: { id: eventId },
      });

      let newScoreA = match.scoreA;
      let newScoreB = match.scoreB;

      if (event.type === "GOAL") {
        if (event.teamId === teamAId) {
          newScoreA = Math.max(0, newScoreA - 1);
        } else if (event.teamId === teamBId) {
          newScoreB = Math.max(0, newScoreB - 1);
        }
      } else if (event.type === "OWN_GOAL") {
        if (event.teamId === teamAId) {
          newScoreB = Math.max(0, newScoreB - 1);
        } else if (event.teamId === teamBId) {
          newScoreA = Math.max(0, newScoreA - 1);
        }
      }

      const updatedMatch = await tx.match.update({
        where: { id: matchId },
        data: {
          scoreA: newScoreA,
          scoreB: newScoreB,
        },
      });

      return { message: "Event deleted", match: updatedMatch };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to delete match event:", error);
    return NextResponse.json({ error: "Failed to delete match event" }, { status: 500 });
  }
}
