/**
 * Match-scoped state helpers: versioning, merges, score derivation.
 */

export const matchDetailInclude = {
  teamA: { include: { players: true } },
  teamB: { include: { players: true } },
  events: {
    include: {
      player: {
        select: { id: true, name: true, shirtNumber: true, teamId: true },
      },
    },
    orderBy: { createdAt: "asc" },
  },
  cricketBalls: { orderBy: { createdAt: "asc" } },
  matchSets: { orderBy: { setNumber: "asc" } },
  round: {
    select: {
      id: true,
      number: true,
      categoryId: true,
      category: {
        select: {
          id: true,
          name: true,
          sport: true,
          oversPerInnings: true,
          fullTimeMinutes: true,
          extraTimeMinutes: true,
          scheduleFormat: true,
        },
      },
    },
  },
};

export function matchUpdatedAtMs(match) {
  if (!match?.updatedAt) return 0;
  const t = new Date(match.updatedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Accept server match only when it is as new or newer than local.
 * Stale tournament/match GETs lose to optimistic / mutation state.
 */
export function shouldAcceptServerMatch(local, server) {
  if (!server) return false;
  if (!local) return true;
  const localMs = matchUpdatedAtMs(local);
  if (localMs === 0) return true;
  const serverMs = matchUpdatedAtMs(server);
  if (serverMs === 0) return false;
  return serverMs >= localMs;
}

export function mergeMatchFromApi(existing, update, { force = false } = {}) {
  if (!update) return existing;
  if (!force && existing && !shouldAcceptServerMatch(existing, update)) {
    return existing;
  }
  const cleaned = Object.fromEntries(
    Object.entries(update).filter(([, v]) => v !== undefined)
  );
  return {
    ...existing,
    ...cleaned,
    teamA: cleaned.teamA || existing?.teamA,
    teamB: cleaned.teamB || existing?.teamB,
    // Never let a scalar-only mutation response wipe the event log with []
    events: Array.isArray(cleaned.events) ? cleaned.events : existing?.events,
    cricketBalls: Array.isArray(cleaned.cricketBalls)
      ? cleaned.cricketBalls
      : existing?.cricketBalls,
    matchSets: Array.isArray(cleaned.matchSets)
      ? cleaned.matchSets
      : existing?.matchSets,
  };
}

/** Football / shootout scores derived from the event log (source of truth). */
export function scoresFromEvents(events, teamAId, teamBId) {
  let scoreA = 0;
  let scoreB = 0;
  let penaltyScoreA = 0;
  let penaltyScoreB = 0;

  for (const event of events || []) {
    const t = String(event.type || "").toUpperCase();
    const teamId = event.teamId;
    if (t === "GOAL" || t === "PENALTY_GOAL") {
      if (teamId === teamAId) scoreA += 1;
      else if (teamId === teamBId) scoreB += 1;
    } else if (t === "OWN_GOAL") {
      if (teamId === teamAId) scoreB += 1;
      else if (teamId === teamBId) scoreA += 1;
    } else if (t === "SHOOTOUT_SCORED") {
      if (teamId === teamAId) penaltyScoreA += 1;
      else if (teamId === teamBId) penaltyScoreB += 1;
    }
  }

  return { scoreA, scoreB, penaltyScoreA, penaltyScoreB };
}

export function patchMatchInTournament(tournament, matchId, updater) {
  if (!tournament) return tournament;
  return {
    ...tournament,
    categories: (tournament.categories || []).map((cat) => ({
      ...cat,
      rounds: (cat.rounds || []).map((round) => ({
        ...round,
        matches: (round.matches || []).map((m) => {
          if (m.id !== matchId) return m;
          return typeof updater === "function" ? updater(m) : { ...m, ...updater };
        }),
      })),
    })),
  };
}

export function stripDeletedEvents(tournament, deletedIds) {
  if (!tournament || !deletedIds?.size) return tournament;
  return {
    ...tournament,
    categories: (tournament.categories || []).map((cat) => ({
      ...cat,
      rounds: (cat.rounds || []).map((round) => ({
        ...round,
        matches: (round.matches || []).map((m) => {
          const events = m.events || [];
          const next = events.filter((e) => !deletedIds.has(e.id));
          return next.length === events.length ? m : { ...m, events: next };
        }),
      })),
    })),
  };
}

/** Scalar fields safe to return from status / slim mutation responses. */
export const matchMutationSelect = {
  id: true,
  status: true,
  scoreA: true,
  scoreB: true,
  teamAId: true,
  teamBId: true,
  currentSet: true,
  currentInnings: true,
  wicketsA: true,
  wicketsB: true,
  ballsFacedA: true,
  ballsFacedB: true,
  kickoffAt: true,
  clockPausedAt: true,
  pausedSeconds: true,
  stoppageMinutes: true,
  clockPeriod: true,
  penaltyScoreA: true,
  penaltyScoreB: true,
  updatedAt: true,
  version: true,
  scoreLockId: true,
  scoreLockedAt: true,
};
