import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { isPlaceholderTeam } from "@/lib/tournamentResolver";
import {
  normalizeSport,
  parseCategoryInputs,
  sportLabel,
} from "@/lib/sports";

export async function GET() {
  try {
    const tournaments = await prisma.tournament.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        categories: {
          orderBy: [{ sport: "asc" }, { name: "asc" }],
          include: {
            teams: {
              select: { name: true },
            },
            rounds: {
              include: {
                matches: {
                  select: { status: true },
                },
              },
            },
          },
        },
      },
    });

    const payload = tournaments.map((t) => {
      let liveMatchCount = 0;
      const sports = new Set();
      const categories = t.categories.map((c) => {
        sports.add(normalizeSport(c.sport));
        for (const round of c.rounds || []) {
          for (const match of round.matches || []) {
            if (match.status === "LIVE") liveMatchCount += 1;
          }
        }
        const clubCount = c.teams.filter((team) => !isPlaceholderTeam(team.name))
          .length;
        const { teams, rounds, ...rest } = c;
        return {
          ...rest,
          sport: normalizeSport(c.sport),
          oversPerInnings: c.oversPerInnings ?? null,
          fullTimeMinutes: c.fullTimeMinutes ?? null,
          extraTimeMinutes: c.extraTimeMinutes ?? null,
          _count: { teams: clubCount },
        };
      });

      return {
        id: t.id,
        name: t.name,
        logoUrl: t.logoUrl,
        sports: [...sports],
        sportLabels: [...sports].map(sportLabel),
        startDate: t.startDate,
        createdAt: t.createdAt,
        liveMatchCount,
        categories,
      };
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to fetch tournaments:", error);
    return NextResponse.json({ error: "Failed to fetch tournaments" }, { status: 500 });
  }
}

export async function POST(request) {
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
