import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

async function getTeamInTournament(tournamentId, teamId) {
  return prisma.team.findFirst({
    where: {
      id: teamId,
      category: { tournamentId },
    },
    include: { players: true },
  });
}

export async function PATCH(request, { params }) {
  try {
    const { id: tournamentId, teamId } = await params;
    const body = await request.json();
    const { name, logoUrl } = body;

    const existing = await getTeamInTournament(tournamentId, teamId);
    if (!existing) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const data = {};
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Team name is required" }, { status: 400 });
      }
      data.name = trimmed;
    }
    if (logoUrl !== undefined) {
      data.logoUrl = logoUrl || null;
    }

    const team = await prisma.team.update({
      where: { id: teamId },
      data,
      include: { players: true },
    });

    return NextResponse.json(team);
  } catch (error) {
    console.error("Failed to update team:", error);
    return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { id: tournamentId, teamId } = await params;
    const body = await request.json();
    const { name, shirtNumber, logoUrl } = body;

    const existing = await getTeamInTournament(tournamentId, teamId);
    if (!existing) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Player name is required" }, { status: 400 });
    }

    const player = await prisma.player.create({
      data: {
        teamId,
        name: String(name).trim(),
        shirtNumber: parseInt(shirtNumber, 10) || 0,
        logoUrl: logoUrl || null,
      },
    });

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { players: true },
    });

    return NextResponse.json({ player, team }, { status: 201 });
  } catch (error) {
    console.error("Failed to add player:", error);
    return NextResponse.json({ error: "Failed to add player" }, { status: 500 });
  }
}
