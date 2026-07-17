import { prisma } from "@/lib/prisma";
import { resolveTournamentPlaceholders } from "@/lib/tournamentResolver";

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
          teamA: {
            include: {
              players: true,
            },
          },
          teamB: {
            include: {
              players: true,
            },
          },
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

export async function loadCategoryById(categoryId) {
  return prisma.tournamentCategory.findUnique({
    where: { id: categoryId },
    include: categoryDetailInclude,
  });
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
        orderBy: { name: "asc" },
        include: categoryDetailInclude,
      },
    },
  });

  if (!tournament) return null;

  tournament.categories = tournament.categories.map((cat) =>
    resolveTournamentPlaceholders(cat)
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

  const resolvedCategory = await loadResolvedCategory(matchWithRound.round.categoryId);
  if (!resolvedCategory) return matchWithRound;

  for (const r of resolvedCategory.rounds) {
    const found = r.matches.find((m) => m.id === matchId);
    if (found) return found;
  }

  return matchWithRound;
}
