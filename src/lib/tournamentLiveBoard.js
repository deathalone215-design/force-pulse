import { prisma } from "@/lib/prisma";
import { resolveTournamentPlaceholders } from "@/lib/tournamentResolver";

const playerLiteSelect = {
  id: true,
  name: true,
  shirtNumber: true,
  logoUrl: true,
  teamId: true,
};

const teamLiteSelect = {
  id: true,
  name: true,
  logoUrl: true,
};

/**
 * Lean public live-board include:
 * - squads once per team (not duplicated on every match)
 * - slim player fields only
 */
const liveBoardCategoryInclude = {
  teams: {
    include: {
      players: {
        select: playerLiteSelect,
        orderBy: { shirtNumber: "asc" },
      },
    },
  },
  rounds: {
    orderBy: { number: "asc" },
    include: {
      matches: {
        include: {
          teamA: { select: teamLiteSelect },
          teamB: { select: teamLiteSelect },
          events: {
            include: {
              player: { select: playerLiteSelect },
            },
            orderBy: { createdAt: "asc" },
          },
          matchSets: {
            orderBy: { setNumber: "asc" },
          },
        },
      },
    },
  },
};

/** Attach category squads onto match teams without duplicating DB reads. */
function attachMatchSquads(category) {
  const byId = Object.fromEntries(
    (category.teams || []).map((t) => [t.id, t])
  );
  for (const round of category.rounds || []) {
    for (const match of round.matches || []) {
      const home = byId[match.teamAId];
      const away = byId[match.teamBId];
      if (match.teamA && home) {
        match.teamA = { ...match.teamA, players: home.players || [] };
      }
      if (match.teamB && away) {
        match.teamB = { ...match.teamB, players: away.players || [] };
      }
      if (!match.cricketBalls) match.cricketBalls = [];
    }
  }
  return category;
}

/** Fast path for /live/[id] — much smaller JSON than full admin payload. */
export async function loadTournamentForLiveBoard(tournamentId) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      categories: {
        orderBy: [{ sport: "asc" }, { name: "asc" }],
        include: liveBoardCategoryInclude,
      },
    },
  });

  if (!tournament) return null;

  const slim = {
    id: tournament.id,
    name: tournament.name,
    logoUrl: tournament.logoUrl,
    startDate: tournament.startDate,
    createdAt: tournament.createdAt,
    serverTime: new Date().toISOString(),
    categories: tournament.categories,
  };

  slim.categories = await Promise.all(
    slim.categories.map(async (cat) => {
      const withSquads = attachMatchSquads(cat);
      if (String(cat.sport || "").toUpperCase() === "CRICKET") {
        const matchIds = (withSquads.rounds || []).flatMap((r) =>
          (r.matches || []).map((m) => m.id)
        );
        if (matchIds.length > 0) {
          const balls = await prisma.cricketBall.findMany({
            where: { matchId: { in: matchIds } },
            orderBy: { createdAt: "asc" },
          });
          const byMatch = new Map();
          for (const b of balls) {
            if (!byMatch.has(b.matchId)) byMatch.set(b.matchId, []);
            byMatch.get(b.matchId).push(b);
          }
          for (const round of withSquads.rounds || []) {
            for (const match of round.matches || []) {
              match.cricketBalls = byMatch.get(match.id) || [];
            }
          }
        }
      }
      return resolveTournamentPlaceholders(withSquads);
    })
  );

  return slim;
}
