/** Football match clock helpers. */

export function formatFootballClock(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Elapsed match seconds, excluding completed pauses and freezing while paused.
 * @param {string|Date|null} kickoffAt
 * @param {number} [now]
 * @param {{ clockPausedAt?: string|Date|null, pausedSeconds?: number }} [opts]
 */
export function footballElapsedSeconds(kickoffAt, now = Date.now(), opts = {}) {
  if (!kickoffAt) return 0;
  const start = new Date(kickoffAt).getTime();
  if (!Number.isFinite(start)) return 0;

  const pausedAt = opts.clockPausedAt ? new Date(opts.clockPausedAt).getTime() : null;
  const end = Number.isFinite(pausedAt) ? pausedAt : now;
  const pausedSec = Math.max(0, parseInt(opts.pausedSeconds, 10) || 0);

  return Math.max(0, Math.floor((end - start) / 1000) - pausedSec);
}

/** Options object from a match row for clock math. */
export function footballClockOpts(match) {
  if (!match) return {};
  return {
    clockPausedAt: match.clockPausedAt ?? null,
    pausedSeconds: match.pausedSeconds ?? 0,
  };
}

export function isFootballClockPaused(match) {
  return Boolean(match?.clockPausedAt);
}

/** Match minute for events (0:00–0:59 → 1', 1:00–1:59 → 2', …). */
export function footballMatchMinute(kickoffAt, now = Date.now(), opts = {}) {
  if (!kickoffAt) return null;
  return Math.floor(footballElapsedSeconds(kickoffAt, now, opts) / 60) + 1;
}

export function footballDisplayMinute(kickoffAt, now = Date.now(), opts = {}) {
  if (!kickoffAt) return 0;
  return Math.floor(footballElapsedSeconds(kickoffAt, now, opts) / 60);
}

/** Format event minute with optional stoppage style: 90+2' */
export function formatEventMinute(minute, stoppageMinutes = 0) {
  if (minute == null || minute === "") return "—";
  const m = parseInt(minute, 10);
  if (!Number.isFinite(m)) return "—";
  const stoppage = Math.max(0, parseInt(stoppageMinutes, 10) || 0);
  if (stoppage > 0 && m > 90) return `90+${m - 90}'`;
  if (stoppage > 0 && m > 45 && m < 90) return `45+${m - 45}'`;
  return `${m}'`;
}

export function isShootoutEvent(type) {
  const t = String(type || "").toUpperCase();
  return t === "SHOOTOUT_SCORED" || t === "SHOOTOUT_MISSED";
}

export function isInGamePenaltyEvent(type) {
  const t = String(type || "").toUpperCase();
  return t === "PENALTY_GOAL" || t === "PENALTY_MISS";
}
