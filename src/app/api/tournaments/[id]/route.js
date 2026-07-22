import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { parseCategoryInputs } from "@/lib/sports";
import { loadTournamentForAdminDashboard } from "@/lib/tournamentData";
import { loadTournamentForLiveBoard } from "@/lib/tournamentLiveBoard";
import { loadLiveBoardDelta } from "@/lib/tournamentLiveDelta";
import {
  requireFullAdmin,
  requireTournamentAccess,
} from "@/lib/accessControl";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const view = url.searchParams.get("view");
    const since = url.searchParams.get("since");

    if (view === "delta") {
      const delta = await loadLiveBoardDelta(id, since);
      if (!delta) {
        return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
      }
      return NextResponse.json(delta, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    if (view !== "live") {
      const access = await requireTournamentAccess(request, id);
      if (access.error) return access.error;
    }

    const tournament =
      view === "live"
        ? await loadTournamentForLiveBoard(id)
        : await loadTournamentForAdminDashboard(id);

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Live board snapshot: short cache OK; deltas stay no-store
    const cacheHeaders =
      view === "live"
        ? {
            "Cache-Control":
              "public, max-age=1, s-maxage=1, stale-while-revalidate=3",
          }
        : {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          };

    return NextResponse.json(tournament, { headers: cacheHeaders });
  } catch (error) {
    console.error("Failed to fetch tournament:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to fetch tournament", detail: error?.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const gate = await requireFullAdmin(request);
  if (gate.error) return gate.error;

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
  const gate = await requireFullAdmin(request);
  if (gate.error) return gate.error;

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
      let parsed;
      try {
        parsed = parseCategoryInputs(categories);
      } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }

      if (parsed.length === 0) {
        return NextResponse.json(
          { error: "Keep at least one category" },
          { status: 400 }
        );
      }

      const desiredKeys = new Set(
        parsed.map((c) => `${c.sport}::${c.name.toLowerCase()}`)
      );
      const existingByKey = new Map(
        existing.categories.map((c) => [
          `${(c.sport || "FOOTBALL").toUpperCase()}::${c.name.toLowerCase()}`,
          c,
        ])
      );

      for (const cat of existing.categories) {
        const key = `${(cat.sport || "FOOTBALL").toUpperCase()}::${cat.name.toLowerCase()}`;
        if (!desiredKeys.has(key)) {
          await prisma.tournamentCategory.delete({ where: { id: cat.id } });
        }
      }

      for (const cat of parsed) {
        const key = `${cat.sport}::${cat.name.toLowerCase()}`;
        const prev = existingByKey.get(key);
        if (!prev) {
          await prisma.tournamentCategory.create({
            data: {
              name: cat.name,
              sport: cat.sport,
              oversPerInnings: cat.oversPerInnings,
              fullTimeMinutes: cat.fullTimeMinutes,
              extraTimeMinutes: cat.extraTimeMinutes,
              pointsPerSet: cat.pointsPerSet,
              setsToWin: cat.setsToWin,
              maxSets: cat.maxSets,
              lastSetPoints: cat.lastSetPoints,
              pointCap: cat.pointCap,
              tournamentId: id,
            },
          });
        } else if (
          prev.oversPerInnings !== cat.oversPerInnings ||
          prev.fullTimeMinutes !== cat.fullTimeMinutes ||
          prev.extraTimeMinutes !== cat.extraTimeMinutes ||
          prev.pointsPerSet !== cat.pointsPerSet ||
          prev.setsToWin !== cat.setsToWin ||
          prev.maxSets !== cat.maxSets ||
          prev.lastSetPoints !== cat.lastSetPoints ||
          prev.pointCap !== cat.pointCap ||
          (prev.sport || "FOOTBALL").toUpperCase() !== cat.sport
        ) {
          await prisma.tournamentCategory.update({
            where: { id: prev.id },
            data: {
              sport: cat.sport,
              oversPerInnings: cat.oversPerInnings,
              fullTimeMinutes: cat.fullTimeMinutes,
              extraTimeMinutes: cat.extraTimeMinutes,
              pointsPerSet: cat.pointsPerSet,
              setsToWin: cat.setsToWin,
              maxSets: cat.maxSets,
              lastSetPoints: cat.lastSetPoints,
              pointCap: cat.pointCap,
            },
          });
        }
      }
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        categories: {
          orderBy: [{ sport: "asc" }, { name: "asc" }],
          include: {
            _count: { select: { teams: true } },
          },
        },
      },
    });

    return NextResponse.json(tournament);
  } catch (error) {
    console.error("Failed to update tournament:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update tournament" },
      { status: 500 }
    );
  }
}
