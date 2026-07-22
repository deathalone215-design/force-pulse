import { prisma } from "@/lib/prisma";
import { resolveTournamentPlaceholders } from "@/lib/tournamentResolver";
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

/** Keep logos for live/detail payloads (http + normal data URLs). */
export function compactLogoUrl(url) {
  return preserveLogoUrl(url);
}

function compactPlayer(p) {
  if (!p) return p;
  return { ...p, logoUrl: preserveLogoUrl(p.logoUrl) };
}

function compactTeam(t) {
  if (!t) return t;
  return {
    ...t,
    logoUrl: preserveLogoUrl(t.logoUrl),
    players: Array.isArray(t.players)
      ? t.players.map(compactPlayer)
      : t.players,
  };
}

/**
 * Lean public live-board include:
 * - squads once per team (not duplicated on every match)
 * - slim player fields only
 * - heavy relations (events/sets) loaded; cricket balls attached only for active matches
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
          manOfTheMatch: { select: playerLiteSelect },
          bestFielder: { select: playerLiteSelect },
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
        match.teamA = enrichMatchTeamSide(match.teamA, home);
      }
      if (match.teamB && away) {
        match.teamB = enrichMatchTeamSide(match.teamB, away);
      }
      // Strip heavy payloads from fixtures that are not being tracked
      if (match.status === "SCHEDULED") {
        match.events = [];
        match.matchSets = match.matchSets?.length ? match.matchSets : [];
        match.cricketBalls = [];
      } else {
        if (Array.isArray(match.events)) {
          match.events = match.events.map((e) => ({
            ...e,
            player: compactPlayer(e.player),
          }));
        }
      }
      if (!match.cricketBalls) match.cricketBalls = [];
      if (match.manOfTheMatch) match.manOfTheMatch = compactPlayer(match.manOfTheMatch);
      if (match.bestFielder) match.bestFielder = compactPlayer(match.bestFielder);
    }
  }
  if (Array.isArray(category.teams)) {
    category.teams = category.teams.map(compactTeam);
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
    logoUrl: compactLogoUrl(tournament.logoUrl),
    startDate: tournament.startDate,
    createdAt: tournament.createdAt,
    serverTime: new Date().toISOString(),
    categories: tournament.categories,
  };

  slim.categories = await Promise.all(
    slim.categories.map(async (cat) => {
      const withSquads = attachMatchSquads(cat);
      if (String(cat.sport || "").toUpperCase() === "CRICKET") {
        // Only load balls for LIVE + COMPLETED (needed for leaders / live card)
        const matchIds = (withSquads.rounds || []).flatMap((r) =>
          (r.matches || [])
            .filter((m) => m.status === "LIVE")
            .map((m) => m.id)
        );
        if (matchIds.length > 0) {
          const balls = await prisma.cricketBall.findMany({
            where: { matchId: { in: matchIds } },
            orderBy: { createdAt: "asc" },
            // Skip unused wide columns for board paint
            select: {
              id: true,
              matchId: true,
              innings: true,
              overNumber: true,
              ballInOver: true,
              battingTeamId: true,
              strikerId: true,
              nonStrikerId: true,
              bowlerId: true,
              runsOffBat: true,
              extras: true,
              extraType: true,
              isWicket: true,
              dismissalType: true,
              dismissedPlayerId: true,
              fielderId: true,
              runsTotal: true,
              isLegal: true,
              createdAt: true,
            },
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
