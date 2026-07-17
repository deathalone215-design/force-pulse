import { prisma } from "@/lib/prisma";

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
