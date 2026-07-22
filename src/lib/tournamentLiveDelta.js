import { prisma } from "@/lib/prisma";
import { preserveLogoUrl, enrichMatchTeamSide } from "@/lib/teamLogo";

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

function compactPlayer(p) {
  if (!p) return p;
  return { ...p, logoUrl: preserveLogoUrl(p.logoUrl) };
}

function attachSquadsToMatch(match, categoryTeams, { needSquads }) {
  const byId = Object.fromEntries(
    (categoryTeams || []).map((t) => [t.id, t])
  );
  const home = byId[match.teamAId];
  const away = byId[match.teamBId];
  const next = { ...match };
  if (next.teamA) {
    next.teamA = enrichMatchTeamSide(next.teamA, home);
    next.teamA.players = needSquads ? (home?.players || []).map(compactPlayer) : [];
  }
  if (next.teamB) {
    next.teamB = enrichMatchTeamSide(next.teamB, away);
    next.teamB.players = needSquads ? (away?.players || []).map(compactPlayer) : [];
  }
  if (!next.cricketBalls) next.cricketBalls = [];
  if (Array.isArray(next.events)) {
    next.events = next.events.map((e) => ({
      ...e,
      player: compactPlayer(e.player),
    }));
  }
  return next;
}

/**
 * Incremental live-board updates: changed matches since `since`, plus all LIVE.
 */
export async function loadLiveBoardDelta(tournamentId, sinceIso) {
  const since = sinceIso ? new Date(sinceIso) : null;
  const sinceOk = since && Number.isFinite(since.getTime());

  // Single query — no separate tournament existence round-trip
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
    take: 80,
  });

  // Empty + no prior since → still confirm tournament exists
  if (matches.length === 0) {
    const exists = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true },
    });
    if (!exists) return null;
    return {
      tournamentId,
      serverTime: new Date().toISOString(),
      matches: [],
    };
  }

  const needSquadCategoryIds = [
    ...new Set(
      matches
        .filter((m) => m.status === "LIVE")
        .map((m) => m.round?.categoryId)
        .filter(Boolean)
    ),
  ];

  const categories =
    needSquadCategoryIds.length > 0
      ? await prisma.tournamentCategory.findMany({
          where: { id: { in: needSquadCategoryIds } },
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
    const needSquads = m.status === "LIVE";
    const withSquads = attachSquadsToMatch(
      m,
      teamsByCategory[categoryId] || [],
      { needSquads }
    );
    // SCHEDULED deltas shouldn't ship ball logs
    if (m.status === "SCHEDULED") {
      withSquads.cricketBalls = [];
      withSquads.events = [];
    }
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
