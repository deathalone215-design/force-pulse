import { shouldAcceptServerMatch } from "@/lib/matchState";
import {
  isPlaceholderTeam,
  resolveTournamentPlaceholders,
} from "@/lib/tournamentResolver";
import { preserveLogoUrl } from "@/lib/teamLogo";

/** Prefer squads already attached on the live board. */
function mergeTeam(localTeam, incomingTeam) {
  if (!incomingTeam) return localTeam;
  // Live deltas send raw TBD placeholders — keep already-resolved club name/logo.
  if (
    isPlaceholderTeam(incomingTeam.name) &&
    localTeam &&
    !isPlaceholderTeam(localTeam.name)
  ) {
    return {
      ...localTeam,
      logoUrl: localTeam.logoUrl || preserveLogoUrl(incomingTeam.logoUrl),
      players: localTeam.players?.length
        ? localTeam.players
        : incomingTeam.players,
    };
  }
  return {
    ...incomingTeam,
    logoUrl: preserveLogoUrl(incomingTeam.logoUrl) || localTeam?.logoUrl || null,
    players: incomingTeam.players?.length
      ? incomingTeam.players
      : localTeam?.players,
  };
}

/**
 * Merge one match patch onto local state.
 * Rejects older payloads so a late snapshot cannot wipe a newer goal/delete.
 */
export function mergeLiveMatch(local, incoming) {
  if (!incoming) return local;
  if (!local) return incoming;

  const incomingVer = Number(incoming.version) || 0;
  const localVer = Number(local.version) || 0;
  const fresherByVersion = incomingVer >= localVer;

  if (!shouldAcceptServerMatch(local, incoming)) {
    // updatedAt lost the race — still absorb score/log fields when version is newer
    return {
      ...local,
      teamA: mergeTeam(local.teamA, incoming.teamA),
      teamB: mergeTeam(local.teamB, incoming.teamB),
      ...(fresherByVersion
        ? {
            scoreA: incoming.scoreA ?? local.scoreA,
            scoreB: incoming.scoreB ?? local.scoreB,
            wicketsA: incoming.wicketsA ?? local.wicketsA,
            wicketsB: incoming.wicketsB ?? local.wicketsB,
            ballsFacedA: incoming.ballsFacedA ?? local.ballsFacedA,
            ballsFacedB: incoming.ballsFacedB ?? local.ballsFacedB,
            penaltyScoreA: incoming.penaltyScoreA ?? local.penaltyScoreA,
            penaltyScoreB: incoming.penaltyScoreB ?? local.penaltyScoreB,
            status: incoming.status ?? local.status,
            currentInnings: incoming.currentInnings ?? local.currentInnings,
            battingTeamId: incoming.battingTeamId ?? local.battingTeamId,
            strikerId: incoming.strikerId !== undefined ? incoming.strikerId : local.strikerId,
            nonStrikerId:
              incoming.nonStrikerId !== undefined
                ? incoming.nonStrikerId
                : local.nonStrikerId,
            bowlerId: incoming.bowlerId !== undefined ? incoming.bowlerId : local.bowlerId,
            version: incoming.version ?? local.version,
            updatedAt: incoming.updatedAt || local.updatedAt,
          }
        : {}),
      events:
        fresherByVersion && Array.isArray(incoming.events)
          ? incoming.events
          : local.events,
      cricketBalls:
        fresherByVersion && Array.isArray(incoming.cricketBalls)
          ? incoming.cricketBalls
          : local.cricketBalls,
      matchSets:
        fresherByVersion && Array.isArray(incoming.matchSets)
          ? incoming.matchSets
          : local.matchSets,
    };
  }

  return {
    ...local,
    ...incoming,
    teamA: mergeTeam(local.teamA, incoming.teamA),
    teamB: mergeTeam(local.teamB, incoming.teamB),
    // Preserve slot ids used for scoring when delta omits them
    teamAId: incoming.teamAId || local.teamAId,
    teamBId: incoming.teamBId || local.teamBId,
    resolvedTeamAId: incoming.resolvedTeamAId || local.resolvedTeamAId,
    resolvedTeamBId: incoming.resolvedTeamBId || local.resolvedTeamBId,
    events: Array.isArray(incoming.events) ? incoming.events : local.events,
    cricketBalls: Array.isArray(incoming.cricketBalls)
      ? incoming.cricketBalls
      : local.cricketBalls,
    matchSets: Array.isArray(incoming.matchSets)
      ? incoming.matchSets
      : local.matchSets,
  };
}

/** Re-run placeholder → club mapping after a delta patch. */
export function reResolveLiveTournament(tournament) {
  if (!tournament?.categories?.length) return tournament;
  return {
    ...tournament,
    categories: tournament.categories.map((cat) =>
      resolveTournamentPlaceholders({
        ...cat,
        teams: (cat.teams || []).map((t) => ({ ...t })),
        rounds: (cat.rounds || []).map((round) => ({
          ...round,
          matches: (round.matches || []).map((m) => ({
            ...m,
            teamA: m.teamA ? { ...m.teamA } : m.teamA,
            teamB: m.teamB ? { ...m.teamB } : m.teamB,
          })),
        })),
      })
    ),
  };
}

/** Merge delta matches into an existing live-board tournament object (client-safe). */
export function applyLiveBoardDelta(tournament, deltaMatches) {
  if (!tournament || !deltaMatches?.length) return tournament;

  const byId = new Map(deltaMatches.map((m) => [m.id, m]));

  const merged = {
    ...tournament,
    categories: (tournament.categories || []).map((cat) => ({
      ...cat,
      rounds: (cat.rounds || []).map((round) => ({
        ...round,
        matches: (round.matches || []).map((m) => {
          const patch = byId.get(m.id);
          if (!patch) return m;
          const {
            categoryId: _c,
            roundId: _r,
            roundNumber: _n,
            ...fields
          } = patch;
          return mergeLiveMatch(m, fields);
        }),
      })),
    })),
  };

  return reResolveLiveTournament(merged);
}

/**
 * Apply a full live snapshot without clobbering matches that local state
 * already has at a newer updatedAt/version (e.g. from a fresher delta).
 */
export function mergeLiveBoardSnapshot(prev, next) {
  if (!next) return prev;
  if (!prev) return next;

  const prevById = new Map();
  for (const cat of prev.categories || []) {
    for (const round of cat.rounds || []) {
      for (const m of round.matches || []) {
        prevById.set(m.id, m);
      }
    }
  }

  return {
    ...next,
    categories: (next.categories || []).map((cat) => ({
      ...cat,
      rounds: (cat.rounds || []).map((round) => ({
        ...round,
        matches: (round.matches || []).map((m) =>
          mergeLiveMatch(prevById.get(m.id), m)
        ),
      })),
    })),
  };
}
