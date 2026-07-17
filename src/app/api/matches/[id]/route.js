import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { findResolvedMatch } from "@/lib/tournamentData";
import { matchDetailInclude } from "@/lib/matchState";
import {
  casErrorResponse,
  casUpdateMatch,
  parseExpectedVersion,
} from "@/lib/matchCas";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const match = await prisma.match.findUnique({
      where: { id },
      include: matchDetailInclude,
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    return NextResponse.json(match, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Failed to load match:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load match" },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { teamAId, teamBId } = body;

    if (!teamAId || !teamBId) {
      return NextResponse.json(
        { error: "Both teamAId and teamBId are required" },
        { status: 400 }
      );
    }

    if (teamAId === teamBId) {
      return NextResponse.json(
        { error: "A team cannot play against itself" },
        { status: 400 }
      );
    }

    const existing = await prisma.match.findUnique({
      where: { id },
      include: { round: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (existing.status !== "SCHEDULED") {
      return NextResponse.json(
        { error: "Only scheduled matches can change teams" },
        { status: 400 }
      );
    }

    const categoryId = existing.round.categoryId;
    const teams = await prisma.team.findMany({
      where: { categoryId, id: { in: [teamAId, teamBId] } },
    });

    if (teams.length !== 2) {
      return NextResponse.json(
        { error: "Both teams must belong to this category" },
        { status: 400 }
      );
    }

    await casUpdateMatch(prisma, id, {
      expectedVersion: parseExpectedVersion(body),
      data: { teamAId, teamBId },
    });

    const resolvedMatch = await findResolvedMatch(id);
    return NextResponse.json(resolvedMatch);
  } catch (error) {
    const casRes = casErrorResponse(error);
    if (casRes) return casRes;
    console.error("Failed to update match teams:", error);
    return NextResponse.json(
      { error: "Failed to update match teams" },
      { status: 500 }
    );
  }
}
