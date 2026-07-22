import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireTournamentAccess } from "@/lib/accessControl";

export async function PATCH(request, { params }) {
  const { id: tournamentId, teamId, playerId } = await params;
  const gate = await requireTournamentAccess(request, tournamentId);
  if (gate.error) return gate.error;

  try {
    const body = await request.json();
    const { name, shirtNumber, logoUrl } = body;

    const player = await prisma.player.findFirst({
      where: {
        id: playerId,
        teamId,
        team: { category: { tournamentId } },
      },
    });

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const data = {};
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Player name is required" }, { status: 400 });
      }
      data.name = trimmed;
    }
    if (shirtNumber !== undefined) {
      data.shirtNumber = parseInt(shirtNumber, 10) || 0;
    }
    if (logoUrl !== undefined) {
      data.logoUrl = logoUrl || null;
    }

    const updated = await prisma.player.update({
      where: { id: playerId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update player:", error);
    return NextResponse.json({ error: "Failed to update player" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { id: tournamentId, teamId, playerId } = await params;
  const gate = await requireTournamentAccess(request, tournamentId);
  if (gate.error) return gate.error;

  try {
    const player = await prisma.player.findFirst({
      where: {
        id: playerId,
        teamId,
        team: { category: { tournamentId } },
      },
    });

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    await prisma.player.delete({ where: { id: playerId } });

    return NextResponse.json({ message: "Player deleted" });
  } catch (error) {
    console.error("Failed to delete player:", error);
    return NextResponse.json({ error: "Failed to delete player" }, { status: 500 });
  }
}
