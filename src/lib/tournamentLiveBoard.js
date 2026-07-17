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

const liveMatchInclude = {
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
  cricketBalls: {
    orderBy: { createdAt: "asc" },
  },
  round: {
    select: {
      id: true,
      number: true,
      categoryId: true,
    },
  },
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

function attachSquadsToMatch(match, categoryTeams) {
  const byId = Object.fromEntries(
    (categoryTeams || []).map((t) => [t.id, t])
  );
  const home = byId[match.teamAId];
  const away = byId[match.teamBId];
  const next = { ...match };
  if (next.teamA && home) {
    next.teamA = { ...next.teamA, players: home.players || [] };
  }
  if (next.teamB && away) {
    next.teamB = { ...next.teamB, players: away.players || [] };
  }
  if (!next.cricketBalls) next.cricketBalls = [];
  return next;
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

/**
 * Incremental live-board updates: changed matches since `since`, plus all LIVE.
 */
export async function loadLiveBoardDelta(tournamentId, sinceIso) {
  const exists = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true },
  });
  if (!exists) return null;

  const since = sinceIso ? new Date(sinceIso) : null;
  const sinceOk = since && Number.isFinite(since.getTime());

  const matches = await prisma.match.findMany({
    where: {
      round: { category: { tournamentId } },
      OR: [
        { status: "LIVE" },
        ...(sinceOk ? [{ updatedAt: { gt: since } }] : []),
      ],
    },
    include: liveMatchInclude,
    orderBy: { updatedAt: "asc" },
  });

  const categoryIds = [
    ...new Set(matches.map((m) => m.round?.categoryId).filter(Boolean)),
  ];
  const categories =
    categoryIds.length > 0
      ? await prisma.tournamentCategory.findMany({
          where: { id: { in: categoryIds } },
          include: {
            teams: {
              include: {
                players: {
                  select: playerLiteSelect,
                  orderBy: { shirtNumber: "asc" },
                },
              },
            },
          },
        })
      : [];
  const teamsByCategory = Object.fromEntries(
    categories.map((c) => [c.id, c.teams])
  );

  const payload = matches.map((m) => {
    const categoryId = m.round?.categoryId;
    const withSquads = attachSquadsToMatch(
      m,
      teamsByCategory[categoryId] || []
    );
    const { round, ...rest } = withSquads;
    return {
      ...rest,
      categoryId,
      roundId: round?.id,
      roundNumber: round?.number,
    };
  });

  return {
    tournamentId,
    serverTime: new Date().toISOString(),
    matches: payload,
  };
}
