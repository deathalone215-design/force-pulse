import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { scoresFromEvents, matchMutationSelect } from "@/lib/matchState";
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

    if (body?.action === "delete" || body?.delete === true) {
      return await deleteMatchEvent(matchId, body);
    }

    const { type, teamId, playerId, minute } = body;
    const expectedVersion = parseExpectedVersion(body);
    const lockToken = parseLockToken(body);

    if (!type) {
      return NextResponse.json({ error: "Event type is required" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    assertWritableLock(match, lockToken);

    const t = String(type).toUpperCase();

    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.matchEvent.create({
        data: {
          matchId,
          teamId,
          playerId,
          type: t,
          minute: minute != null && minute !== "" ? parseInt(minute, 10) : null,
        },
        include: {
          player: {
            select: { id: true, name: true, shirtNumber: true, teamId: true },
          },
        },
      });

      const allEvents = await tx.matchEvent.findMany({
        where: { matchId },
        select: { type: true, teamId: true },
      });
      const scores = scoresFromEvents(allEvents, match.teamAId, match.teamBId);

      const updatedMatch = await casUpdateMatch(tx, matchId, {
        expectedVersion,
        data: scores,
        select: matchMutationSelect,
      });

      return { event, match: updatedMatch };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const casRes = casErrorResponse(error);
    if (casRes) return casRes;
    console.error("Failed to add/delete match event:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update match event" },
      { status: 500 }
    );
  }
}

async function deleteMatchEvent(matchId, body) {
  const eventId = body?.eventId;
  const expectedVersion = parseExpectedVersion(body);
  const lockToken = parseLockToken(body);

  if (!eventId) {
    return NextResponse.json({ error: "Event ID is required" }, { status: 400 });
  }

  const event = await prisma.matchEvent.findFirst({
    where: { id: String(eventId), matchId },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  assertWritableLock(match, lockToken);

  const result = await prisma.$transaction(async (tx) => {
    await tx.matchEvent.delete({
      where: { id: String(eventId) },
    });

    const remaining = await tx.matchEvent.findMany({
      where: { matchId },
      select: { type: true, teamId: true },
    });
    const scores = scoresFromEvents(remaining, match.teamAId, match.teamBId);

    const updatedMatch = await casUpdateMatch(tx, matchId, {
      expectedVersion,
      data: scores,
      select: matchMutationSelect,
    });

    return {
      message: "Event deleted",
      match: updatedMatch,
      eventId: String(eventId),
    };
  });

  return NextResponse.json(result);
}

export async function DELETE(request, { params }) {
  try {
    const { id: matchId } = await params;
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    if (!body.eventId) {
      try {
        body.eventId = new URL(request.url).searchParams.get("eventId");
      } catch {
        /* ignore */
      }
    }
    return await deleteMatchEvent(matchId, body);
  } catch (error) {
    const casRes = casErrorResponse(error);
    if (casRes) return casRes;
    console.error("Failed to delete match event:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete match event" },
      { status: 500 }
    );
  }
}
