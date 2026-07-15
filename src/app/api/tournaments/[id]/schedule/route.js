import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request, { params }) {
  try {
    const { id: tournamentId } = await params;
    const body = await request.json();
    const { rounds, categoryId } = body;

    if (!categoryId) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    if (!rounds || !Array.isArray(rounds)) {
      return NextResponse.json({ error: "Rounds array is required" }, { status: 400 });
    }

    const category = await prisma.tournamentCategory.findFirst({
      where: { id: categoryId, tournamentId },
      include: { tournament: true },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Category not found in this tournament" },
        { status: 404 }
      );
    }

    const oversLimit =
      category.tournament?.sport === "CRICKET"
        ? category.tournament.oversPerInnings || null
        : null;

    // Only wipe schedule for this category
    await prisma.round.deleteMany({
      where: { categoryId },
    });

    const createdRounds = [];

    for (const r of rounds) {
      const round = await prisma.round.create({
        data: {
          number: parseInt(r.number, 10) || 1,
          categoryId,
          matches: {
            create: (r.matches || []).map((m) => ({
              teamAId: m.teamAId,
              teamBId: m.teamBId,
              status: "SCHEDULED",
              scoreA: 0,
              scoreB: 0,
              oversLimit,
            })),
          },
        },
        include: {
          matches: {
            include: {
              teamA: true,
              teamB: true,
            },
          },
        },
      });
      createdRounds.push(round);
    }

    return NextResponse.json(createdRounds, { status: 201 });
  } catch (error) {
    console.error("Failed to save schedule:", error);
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
  }
}
