import { prisma } from "@/lib/prisma";
import { resolveTournamentPlaceholders } from "@/lib/tournamentResolver";

// Re-export for callers that still import from this module
export { loadTournamentForLiveBoard } from "@/lib/tournamentLiveBoard";

const teamLiteSelect = {
  id: true,
  name: true,
  logoUrl: true,
};

/**
 * Lean admin/scorer include: squads once per team (not nested on every match).
 * Call attachMatchSquads() after load for scorer UX that needs players on teamA/B.
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
          cricketBalls: {
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
export function attachMatchSquads(category) {
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

export async function loadCategoryById(categoryId) {
  const category = await prisma.tournamentCategory.findUnique({
    where: { id: categoryId },
    include: categoryDetailInclude,
  });
  if (!category) return null;
  return attachMatchSquads(category);
}

export async function loadResolvedCategory(categoryId) {
  const category = await loadCategoryById(categoryId);
  if (!category) return null;
  return resolveTournamentPlaceholders(category);
}

export async function loadTournamentWithCategories(tournamentId) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      categories: {
        orderBy: [{ sport: "asc" }, { name: "asc" }],
        include: categoryDetailInclude,
      },
    },
  });

  if (!tournament) return null;

  tournament.categories = tournament.categories.map((cat) =>
    resolveTournamentPlaceholders(attachMatchSquads(cat))
  );

  return tournament;
}

export async function findResolvedMatch(matchId) {
  const matchWithRound = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      round: true,
    },
  });

  if (!matchWithRound) return null;

  const resolvedCategory = await loadResolvedCategory(
    matchWithRound.round.categoryId
  );
  if (!resolvedCategory) return matchWithRound;

  for (const r of resolvedCategory.rounds) {
    const found = r.matches.find((m) => m.id === matchId);
    if (found) return found;
  }

  return matchWithRound;
}
