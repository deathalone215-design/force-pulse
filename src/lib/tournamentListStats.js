import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPlaceholderTeam } from "@/lib/tournamentResolver";

/**
 * Aggregate match counts per tournament in one SQL round-trip (no loading every match row).
 */
export async function loadTournamentMatchStats(tournamentIds) {
  if (!tournamentIds.length) return new Map();

  const rows = await prisma.$queryRaw`
    SELECT tc."tournamentId" AS "tournamentId",
           m.status AS status,
           COUNT(*)::int AS count
    FROM "Match" m
    INNER JOIN "Round" r ON m."roundId" = r.id
    INNER JOIN "TournamentCategory" tc ON r."categoryId" = tc.id
    WHERE tc."tournamentId" IN (${Prisma.join(tournamentIds)})
    GROUP BY tc."tournamentId", m.status
  `;

  const byTournament = new Map();
  for (const id of tournamentIds) {
    byTournament.set(id, {
      liveMatchCount: 0,
      totalMatchCount: 0,
      completedMatchCount: 0,
    });
  }

  for (const row of rows) {
    const bucket = byTournament.get(row.tournamentId);
    if (!bucket) continue;
    const n = Number(row.count) || 0;
    bucket.totalMatchCount += n;
    if (row.status === "LIVE") bucket.liveMatchCount += n;
    if (row.status === "COMPLETED") bucket.completedMatchCount += n;
  }

  return byTournament;
}

/** Real club counts per category (exclude TBD / placeholder names). */
export async function loadCategoryClubCounts(tournamentIds) {
  if (!tournamentIds.length) return new Map();

  const teams = await prisma.team.findMany({
    where: { category: { tournamentId: { in: tournamentIds } } },
    select: { categoryId: true, name: true },
  });

  const byCategory = new Map();
  for (const team of teams) {
    if (isPlaceholderTeam(team.name)) continue;
    byCategory.set(team.categoryId, (byCategory.get(team.categoryId) || 0) + 1);
  }
  return byCategory;
}
