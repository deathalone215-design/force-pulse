import { shouldAcceptServerMatch } from "@/lib/matchState";

/** Prefer squads already attached on the live board. */
function mergeTeam(localTeam, incomingTeam) {
  if (!incomingTeam) return localTeam;
  return {
    ...incomingTeam,
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

  if (!shouldAcceptServerMatch(local, incoming)) {
    return {
      ...local,
      teamA: mergeTeam(local.teamA, incoming.teamA),
      teamB: mergeTeam(local.teamB, incoming.teamB),
    };
  }

  return {
    ...local,
    ...incoming,
    teamA: mergeTeam(local.teamA, incoming.teamA),
    teamB: mergeTeam(local.teamB, incoming.teamB),
    events: Array.isArray(incoming.events) ? incoming.events : local.events,
    cricketBalls: Array.isArray(incoming.cricketBalls)
      ? incoming.cricketBalls
      : local.cricketBalls,
    matchSets: Array.isArray(incoming.matchSets)
      ? incoming.matchSets
      : local.matchSets,
  };
}

/** Merge delta matches into an existing live-board tournament object (client-safe). */
export function applyLiveBoardDelta(tournament, deltaMatches) {
  if (!tournament || !deltaMatches?.length) return tournament;

  const byId = new Map(deltaMatches.map((m) => [m.id, m]));

  return {
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
