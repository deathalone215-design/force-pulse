import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireTournamentAccess } from "@/lib/accessControl";

export async function POST(request, { params }) {
  const { id: tournamentId } = await params;
  const gate = await requireTournamentAccess(request, tournamentId);
  if (gate.error) return gate.error;

  try {
    const body = await request.json();
    const { name, logoUrl, players, categoryId } = body;

    if (!categoryId) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 });
    }

    const category = await prisma.tournamentCategory.findFirst({
      where: { id: categoryId, tournamentId },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Category not found in this tournament" },
        { status: 404 }
      );
    }

    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        logoUrl: logoUrl || null,
        categoryId,
        players: {
          create: (players || [])
            .filter((p) => p.name && p.name.trim())
            .map((p) => ({
              name: p.name.trim(),
              shirtNumber: parseInt(p.shirtNumber, 10) || 0,
              logoUrl: p.logoUrl || null,
            })),
        },
      },
      include: {
        players: true,
      },
    });

    return NextResponse.json(team, { status: 201 });
  } catch (error) {
    console.error("Failed to create team:", error);
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}
