/** Calendar date only (local), ignoring time. */
export function toDay(dateLike) {
  const d = new Date(dateLike);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Tournament day has begun (start date is today or past). */
export function hasTournamentDayStarted(tournament, now = new Date()) {
  if (!tournament?.startDate) return false;
  return toDay(now).getTime() >= toDay(tournament.startDate).getTime();
}

/**
 * Show as "Live" on the public home when:
 * - tournament day has started (e.g. Jul 18), AND
 * - admin has set at least one match to LIVE
 */
export function isTournamentLiveNow(tournament, now = new Date()) {
  if (!hasTournamentDayStarted(tournament, now)) return false;
  return (tournament.liveMatchCount || 0) > 0;
}

/** @deprecated use hasTournamentDayStarted / isTournamentLiveNow */
export function isTournamentLive(tournament, now = new Date()) {
  return hasTournamentDayStarted(tournament, now);
}

export function formatTournamentDate(dateLike) {
  return new Date(dateLike).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
