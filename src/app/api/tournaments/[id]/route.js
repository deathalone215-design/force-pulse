import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { loadTournamentWithCategories } from "@/lib/tournamentData";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const tournament = await loadTournamentWithCategories(id);

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    return NextResponse.json(tournament);
  } catch (error) {
    console.error("Failed to fetch tournament:", error);
    return NextResponse.json({ error: "Failed to fetch tournament" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    await prisma.tournament.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Tournament deleted successfully" });
  } catch (error) {
    console.error("Failed to delete tournament:", error);
    return NextResponse.json({ error: "Failed to delete tournament" }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, startDate, logoUrl, categories } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Tournament name is required" }, { status: 400 });
    }

    const existing = await prisma.tournament.findUnique({
      where: { id },
      include: { categories: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const data = {
      name: name.trim(),
      startDate: startDate ? new Date(startDate) : existing.startDate,
    };

    if (logoUrl !== undefined) {
      data.logoUrl = logoUrl || null;
    }

    await prisma.tournament.update({
      where: { id },
      data,
    });

    if (Array.isArray(categories)) {
      const desired = [
        ...new Set(categories.map((c) => String(c).trim()).filter(Boolean)),
      ];

      if (desired.length === 0) {
        return NextResponse.json(
          { error: "Keep at least one category" },
          { status: 400 }
        );
      }

      const existingByName = new Map(
        existing.categories.map((c) => [c.name, c])
      );

      for (const cat of existing.categories) {
        if (!desired.includes(cat.name)) {
          await prisma.tournamentCategory.delete({ where: { id: cat.id } });
        }
      }

      for (const categoryName of desired) {
        if (!existingByName.has(categoryName)) {
          await prisma.tournamentCategory.create({
            data: { name: categoryName, tournamentId: id },
          });
        }
      }
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        categories: {
          orderBy: { name: "asc" },
          include: {
            _count: { select: { teams: true } },
          },
        },
      },
    });

    return NextResponse.json(tournament);
  } catch (error) {
    console.error("Failed to update tournament:", error);
    return NextResponse.json({ error: "Failed to update tournament" }, { status: 500 });
  }
}
