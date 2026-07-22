/** Calendar date only (local), ignoring time of day. */
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

/** Planned match time chip label, e.g. "Jul 21 · 5:00 PM". */
export function formatScheduledAt(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/** Match totals from list API (`totalMatchCount`, `completedMatchCount`, `liveMatchCount`). */
export function tournamentMatchStats(tournament) {
  return {
    total: tournament?.totalMatchCount ?? 0,
    completed: tournament?.completedMatchCount ?? 0,
    live: tournament?.liveMatchCount ?? 0,
  };
}

/** All scheduled matches finished — no LIVE games left. */
export function isTournamentComplete(tournament) {
  const { total, completed, live } = tournamentMatchStats(tournament);
  return total > 0 && completed === total && live === 0;
}
