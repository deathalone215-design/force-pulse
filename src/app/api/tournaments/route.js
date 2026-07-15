import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { isPlaceholderTeam } from "@/lib/tournamentResolver";

export async function GET() {
  try {
    const tournaments = await prisma.tournament.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        categories: {
          orderBy: { name: "asc" },
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

    // Real clubs only + how many matches admin has set to LIVE
    const payload = tournaments.map((t) => {
      let liveMatchCount = 0;
      const categories = t.categories.map((c) => {
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
          _count: { teams: clubCount },
        };
      });

      return {
        id: t.id,
        name: t.name,
        logoUrl: t.logoUrl,
        sport: t.sport || "FOOTBALL",
        oversPerInnings: t.oversPerInnings ?? null,
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
    const { name, startDate, logoUrl, categories, sport, oversPerInnings } = body;

    if (!name) {
      return NextResponse.json({ error: "Tournament name is required" }, { status: 400 });
    }

    const categoryNames = Array.isArray(categories)
      ? [...new Set(categories.map((c) => String(c).trim()).filter(Boolean))]
      : [];

    if (categoryNames.length === 0) {
      return NextResponse.json(
        { error: "Select at least one category" },
        { status: 400 }
      );
    }

    const sportValue = String(sport || "FOOTBALL").toUpperCase() === "CRICKET"
      ? "CRICKET"
      : "FOOTBALL";

    let overs = null;
    if (sportValue === "CRICKET") {
      overs = parseInt(oversPerInnings, 10);
      if (!overs || overs < 1 || overs > 50) {
        return NextResponse.json(
          { error: "Cricket tournaments need overs per innings between 1 and 50" },
          { status: 400 }
        );
      }
    }

    const tournament = await prisma.tournament.create({
      data: {
        name,
        logoUrl: logoUrl || null,
        sport: sportValue,
        oversPerInnings: overs,
        startDate: startDate ? new Date(startDate) : new Date(),
        categories: {
          create: categoryNames.map((categoryName) => ({ name: categoryName })),
        },
      },
      include: {
        categories: {
          orderBy: { name: "asc" },
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
    return NextResponse.json({ error: "Failed to create tournament" }, { status: 500 });
  }
}
