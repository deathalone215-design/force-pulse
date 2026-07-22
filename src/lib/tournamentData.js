import { prisma } from "@/lib/prisma";
import { resolveTournamentPlaceholders } from "@/lib/tournamentResolver";
import { enrichMatchTeamSide } from "@/lib/teamLogo";

// Re-export for callers that still import from this module
export { loadTournamentForLiveBoard } from "@/lib/tournamentLiveBoard";

const teamLiteSelect = {
  id: true,
  name: true,
  logoUrl: true,
};

const playerAwardSelect = {
  id: true,
  name: true,
  shirtNumber: true,
  logoUrl: true,
  teamId: true,
};

/** Dashboard/scorer shell — matches without nested events (events batch-loaded). */
export const categoryDashboardInclude = {
  teams: {
    include: {
      players: true,
    },
  },
  rounds: {
    orderBy: { number: "asc" },
    include: {
      matches: {
        orderBy: { createdAt: "asc" },
        include: {
          teamA: { select: teamLiteSelect },
          teamB: { select: teamLiteSelect },
          matchSets: {
            orderBy: { setNumber: "asc" },
          },
          manOfTheMatch: { select: playerAwardSelect },
          bestFielder: { select: playerAwardSelect },
        },
      },
    },
  },
};

/**
 * Full detail (legacy) — includes events on every match. Prefer loadTournamentForAdminDashboard.
 */
export const categoryDetailInclude = {
  teams: {
    include: {
      players: true,
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
              player: true,
            },
            orderBy: { createdAt: "asc" },
          },
          matchSets: {
            orderBy: { setNumber: "asc" },
          },
          manOfTheMatch: { select: playerAwardSelect },
          bestFielder: { select: playerAwardSelect },
        },
      },
    },
  },
};

/** Attach category squads onto match teams without duplicating DB reads. */
export function attachMatchSquads(category) {
  const byId = Object.fromEntries(
    (category.teams || []).map((t) => [t.id, t])
  );
  for (const round of category.rounds || []) {
    for (const match of round.matches || []) {
      const home = byId[match.teamAId];
      const away = byId[match.teamBId];
      if (match.teamA && home) {
        match.teamA = enrichMatchTeamSide(match.teamA, home);
      }
      if (match.teamB && away) {
        match.teamB = enrichMatchTeamSide(match.teamB, away);
      }
      if (!match.events) match.events = [];
      if (!match.cricketBalls) match.cricketBalls = [];
    }
  }
  return category;
}

async function attachMatchEvents(categories) {
  const categoryIds = categories.map((c) => c.id);
  if (!categoryIds.length) return categories;

  const events = await prisma.matchEvent.findMany({
    where: {
      match: {
        status: { in: ["LIVE", "COMPLETED"] },
        round: { categoryId: { in: categoryIds } },
      },
    },
    include: {
      player: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const eventsByMatch = new Map();
  for (const event of events) {
    if (!eventsByMatch.has(event.matchId)) {
      eventsByMatch.set(event.matchId, []);
    }
    eventsByMatch.get(event.matchId).push(event);
  }

  for (const category of categories) {
    for (const round of category.rounds || []) {
      for (const match of round.matches || []) {
        match.events = eventsByMatch.get(match.id) || [];
      }
    }
  }

  return categories;
}

export async function loadCategoryById(categoryId) {
  const category = await prisma.tournamentCategory.findUnique({
    where: { id: categoryId },
    include: categoryDashboardInclude,
  });
  if (!category) return null;
  await attachMatchEvents([category]);
  return attachMatchSquads(category);
}

export async function loadResolvedCategory(categoryId) {
  const category = await loadCategoryById(categoryId);
  if (!category) return null;
  return resolveTournamentPlaceholders(category);
}

/** Fast admin dashboard load — squads + fixtures; events batched for LIVE/COMPLETED only. */
export async function loadTournamentForAdminDashboard(tournamentId) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      categories: {
        orderBy: [{ sport: "asc" }, { name: "asc" }],
        include: categoryDashboardInclude,
      },
    },
  });

  if (!tournament) return null;

  await attachMatchEvents(tournament.categories);
  tournament.categories = tournament.categories.map((cat) =>
    resolveTournamentPlaceholders(attachMatchSquads(cat))
  );

  return tournament;
}

export async function loadTournamentWithCategories(tournamentId) {
  return loadTournamentForAdminDashboard(tournamentId);
}

/** Lighter than loading the full category — only the one match with squads resolved. */
export async function findResolvedMatch(matchId) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: { select: teamLiteSelect },
      teamB: { select: teamLiteSelect },
      events: {
        include: { player: true },
        orderBy: { createdAt: "asc" },
      },
      matchSets: { orderBy: { setNumber: "asc" } },
      round: true,
    },
  });

  if (!match) return null;

  const category = await prisma.tournamentCategory.findUnique({
    where: { id: match.round.categoryId },
    include: {
      teams: { include: { players: true } },
    },
  });

  if (!category) return match;

  const byId = Object.fromEntries(category.teams.map((t) => [t.id, t]));
  const home = byId[match.teamAId];
  const away = byId[match.teamBId];
  if (match.teamA && home) match.teamA = enrichMatchTeamSide(match.teamA, home);
  if (match.teamB && away) match.teamB = enrichMatchTeamSide(match.teamB, away);

  return resolveTournamentPlaceholders({
    ...category,
    rounds: [{ ...match.round, matches: [match] }],
  }).rounds[0].matches.find((m) => m.id === matchId);
}
