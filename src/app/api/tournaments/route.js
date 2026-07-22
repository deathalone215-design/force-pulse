import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  normalizeSport,
  parseCategoryInputs,
  sportLabel,
} from "@/lib/sports";
import { listLogoUrl } from "@/lib/teamLogo";
import { getAuthFromRequest, isFullAdminAuth } from "@/lib/session";
import { requireFullAdmin } from "@/lib/accessControl";
import {
  loadCategoryClubCounts,
  loadTournamentMatchStats,
} from "@/lib/tournamentListStats";

export async function GET(request) {
  try {
    const auth = getAuthFromRequest(request);
    const isManager =
      auth?.kind === "user" && auth.role === "MANAGER" && !isFullAdminAuth(auth);

    const tournaments = await prisma.tournament.findMany({
      where: isManager
        ? { assignments: { some: { userId: auth.userId } } }
        : undefined,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        startDate: true,
        createdAt: true,
        categories: {
          orderBy: [{ sport: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            sport: true,
            oversPerInnings: true,
            fullTimeMinutes: true,
            extraTimeMinutes: true,
            scheduleFormat: true,
          },
        },
      },
    });

    const tournamentIds = tournaments.map((t) => t.id);
    const [matchStats, clubCounts] = await Promise.all([
      loadTournamentMatchStats(tournamentIds),
      loadCategoryClubCounts(tournamentIds),
    ]);

    const payload = tournaments.map((t) => {
      const stats = matchStats.get(t.id) || {
        liveMatchCount: 0,
        totalMatchCount: 0,
        completedMatchCount: 0,
      };
      const sports = new Set();
      const categories = t.categories.map((c) => {
        sports.add(normalizeSport(c.sport));
        return {
          ...c,
          sport: normalizeSport(c.sport),
          oversPerInnings: c.oversPerInnings ?? null,
          fullTimeMinutes: c.fullTimeMinutes ?? null,
          extraTimeMinutes: c.extraTimeMinutes ?? null,
          _count: { teams: clubCounts.get(c.id) || 0 },
        };
      });

      return {
        id: t.id,
        name: t.name,
        logoUrl: listLogoUrl(t.logoUrl),
        sports: [...sports],
        sportLabels: [...sports].map(sportLabel),
        startDate: t.startDate,
        createdAt: t.createdAt,
        liveMatchCount: stats.liveMatchCount,
        totalMatchCount: stats.totalMatchCount,
        completedMatchCount: stats.completedMatchCount,
        categories,
      };
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=2, s-maxage=5, stale-while-revalidate=10",
      },
    });
  } catch (error) {
    console.error("Failed to fetch tournaments:", error);
    return NextResponse.json({ error: "Failed to fetch tournaments" }, { status: 500 });
  }
}

export async function POST(request) {
  const gate = await requireFullAdmin(request);
  if (gate.error) return gate.error;

  try {
    const body = await request.json();
    const { name, startDate, logoUrl, categories, sport } = body;

    if (!name) {
      return NextResponse.json({ error: "Tournament name is required" }, { status: 400 });
    }

    let parsed;
    try {
      parsed = parseCategoryInputs(categories, sport || "FOOTBALL");
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "Select at least one category" },
        { status: 400 }
      );
    }

    const tournament = await prisma.tournament.create({
      data: {
        name,
        logoUrl: logoUrl || null,
        startDate: startDate ? new Date(startDate) : new Date(),
        categories: {
          create: parsed.map((c) => ({
            name: c.name,
            sport: c.sport,
            oversPerInnings: c.oversPerInnings,
            fullTimeMinutes: c.fullTimeMinutes,
            extraTimeMinutes: c.extraTimeMinutes,
            pointsPerSet: c.pointsPerSet,
            setsToWin: c.setsToWin,
            maxSets: c.maxSets,
            lastSetPoints: c.lastSetPoints,
            pointCap: c.pointCap,
          })),
        },
      },
      include: {
        categories: {
          orderBy: [{ sport: "asc" }, { name: "asc" }],
          include: {
            _count: {
              select: { teams: true },
            },
          },
        },
      },
    });

    return NextResponse.json(tournament, { status: 201 });
  } catch (error) {
    console.error("Failed to create tournament:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create tournament" },
      { status: 500 }
    );
  }
}
