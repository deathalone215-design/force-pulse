/** Football match clock helpers. */

export const FOOTBALL_PERIODS = {
  FIRST_HALF: "FIRST_HALF",
  HALF_TIME: "HALF_TIME",
  SECOND_HALF: "SECOND_HALF",
  FULL_TIME: "FULL_TIME",
};

export const FOOTBALL_PERIOD_LABELS = {
  FIRST_HALF: "1st half",
  HALF_TIME: "Half-time",
  SECOND_HALF: "2nd half",
  FULL_TIME: "Full time",
};

export const FOOTBALL_PERIOD_SHORT = {
  FIRST_HALF: "1H",
  HALF_TIME: "HT",
  SECOND_HALF: "2H",
  FULL_TIME: "FT",
};

export const HALF_SECONDS = 45 * 60;
export const FULL_SECONDS = 90 * 60;
/** Legacy short-format FT when category has no fullTimeMinutes yet. */
export const COMPLETED_CLOCK_SECONDS = 20 * 60;

/** Tournaments that default to 20:00 FT if category.fullTimeMinutes is unset. */
export const SHORT_COMPLETED_CLOCK_TOURNAMENT_IDS = new Set([
  "0781ebe3-1f0a-4a1c-a25c-88c984567f7d", // LSA Football 2026
]);

export function usesShortCompletedClock(tournamentId) {
  return SHORT_COMPLETED_CLOCK_TOURNAMENT_IDS.has(String(tournamentId || ""));
}

/** Parse category full-time minutes (1–120), or null. */
export function parseFullTimeMinutes(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1 || n > 120) return null;
  return n;
}

/** Parse optional +extra minutes (0–30). */
export function parseExtraTimeMinutes(value) {
  if (value == null || value === "") return 0;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(30, n);
}

/**
 * Resolve FT minutes for a category / tournament.
 * Prefers category.fullTimeMinutes; falls back to 20 for legacy short tournaments.
 */
export function resolveFullTimeMinutes(fullTimeMinutes, tournamentId = null) {
  const parsed = parseFullTimeMinutes(fullTimeMinutes);
  if (parsed != null) return parsed;
  if (usesShortCompletedClock(tournamentId)) return 20;
  return null;
}

export function footballFullSeconds(fullTimeMinutes, tournamentId = null) {
  const mins = resolveFullTimeMinutes(fullTimeMinutes, tournamentId);
  if (mins != null) return mins * 60;
  return FULL_SECONDS;
}

export function footballHalfSeconds(fullTimeMinutes, tournamentId = null) {
  return Math.floor(footballFullSeconds(fullTimeMinutes, tournamentId) / 2);
}

/** Extra minutes to show: match stoppage wins, else category default. */
export function resolveExtraMinutes(stoppageMinutes, extraTimeMinutes) {
  const stoppage = Math.max(0, parseInt(stoppageMinutes, 10) || 0);
  if (stoppage > 0) return stoppage;
  return parseExtraTimeMinutes(extraTimeMinutes);
}

/**
 * Completed-match clock label for viewers.
 * e.g. "20:00" or "20:00 +2'" when extra is set.
 */
export function completedFootballClockLabel({
  fullTimeMinutes = null,
  extraTimeMinutes = null,
  stoppageMinutes = null,
  tournamentId = null,
  kickoffAt = null,
  clockOpts = {},
  now = Date.now(),
} = {}) {
  const ft = resolveFullTimeMinutes(fullTimeMinutes, tournamentId);
  const extra = resolveExtraMinutes(stoppageMinutes, extraTimeMinutes);

  if (ft != null) {
    const base = formatFootballClock(ft * 60);
    return extra > 0 ? `${base} +${extra}'` : base;
  }

  if (!kickoffAt) return null;
  return formatFootballClock(footballElapsedSeconds(kickoffAt, now, clockOpts));
}

export function normalizeFootballPeriod(period, status) {
  const p = String(period || "").toUpperCase();
  if (Object.values(FOOTBALL_PERIODS).includes(p)) return p;
  if (status === "COMPLETED") return FOOTBALL_PERIODS.FULL_TIME;
  if (status === "LIVE") return FOOTBALL_PERIODS.FIRST_HALF;
  return FOOTBALL_PERIODS.FIRST_HALF;
}

export function footballPeriodLabel(period, status) {
  return FOOTBALL_PERIOD_LABELS[normalizeFootballPeriod(period, status)] || "1st half";
}

export function footballPeriodShort(period, status) {
  return FOOTBALL_PERIOD_SHORT[normalizeFootballPeriod(period, status)] || "1H";
}

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

/**
 * Infer kickoff time from an event so the clock matches scored minutes.
 * minute 2' at eventTime → kickoff ≈ eventTime − 1 minute.
 */
export function kickoffFromEvent({ createdAt, minute }, fallbackNow = new Date()) {
  const eventAt = createdAt ? new Date(createdAt) : null;
  const base =
    eventAt && Number.isFinite(eventAt.getTime()) ? eventAt : new Date(fallbackNow);
  const m = minute != null && minute !== "" ? parseInt(minute, 10) : NaN;
  if (Number.isFinite(m) && m >= 1) {
    return new Date(base.getTime() - (m - 1) * 60 * 1000);
  }
  return base;
}

export function footballDisplayMinute(kickoffAt, now = Date.now(), opts = {}) {
  if (!kickoffAt) return 0;
  return Math.floor(footballElapsedSeconds(kickoffAt, now, opts) / 60);
}

/** kickoffAt such that elapsed ≈ targetSeconds (pausedSeconds = 0). */
export function kickoffForElapsed(targetSeconds, now = new Date(), paused = false) {
  const sec = Math.max(0, Math.min(180 * 60, Math.floor(Number(targetSeconds) || 0)));
  const at = new Date(now.getTime() - sec * 1000);
  return {
    kickoffAt: at,
    pausedSeconds: 0,
    clockPausedAt: paused ? new Date(now) : null,
  };
}

/**
 * Live board / scorer minute label with stoppage style when past half/full.
 * e.g. 45+2' or 90+3' (or 10+1' / 20+2' for short formats).
 */
export function footballLiveMinuteLabel(match, now = Date.now(), fullTimeMinutes = null) {
  if (!match?.kickoffAt) return null;
  const period = normalizeFootballPeriod(match.clockPeriod, match.status);
  if (period === FOOTBALL_PERIODS.HALF_TIME) return "HT";
  if (period === FOOTBALL_PERIODS.FULL_TIME || match.status === "COMPLETED") return "FT";

  const elapsed = footballElapsedSeconds(match.kickoffAt, now, footballClockOpts(match));
  const mins = Math.floor(elapsed / 60);
  const stoppage = Math.max(0, parseInt(match.stoppageMinutes, 10) || 0);
  const halfMin = Math.floor(
    footballHalfSeconds(fullTimeMinutes ?? match?.fullTimeMinutes) / 60
  );
  const fullMin = Math.floor(
    footballFullSeconds(fullTimeMinutes ?? match?.fullTimeMinutes) / 60
  );

  if (period === FOOTBALL_PERIODS.FIRST_HALF) {
    if (mins >= halfMin) {
      const extra = Math.max(mins - halfMin, stoppage > 0 ? stoppage : mins - halfMin);
      return `${halfMin}+${Math.max(1, extra)}'`;
    }
    return `${mins}'`;
  }

  if (period === FOOTBALL_PERIODS.SECOND_HALF) {
    if (mins >= fullMin) {
      const extra = Math.max(mins - fullMin, stoppage > 0 ? stoppage : mins - fullMin);
      return `${fullMin}+${Math.max(1, extra)}'`;
    }
    return `${mins}'`;
  }

  return `${mins}'`;
}

/** Format event minute with optional stoppage style: 90+2' */
export function formatEventMinute(minute, stoppageMinutes = 0, fullTimeMinutes = null) {
  if (minute == null || minute === "") return "—";
  const m = parseInt(minute, 10);
  if (!Number.isFinite(m)) return "—";
  const stoppage = Math.max(0, parseInt(stoppageMinutes, 10) || 0);
  const halfMin = Math.floor(footballHalfSeconds(fullTimeMinutes) / 60);
  const fullMin = Math.floor(footballFullSeconds(fullTimeMinutes) / 60);
  if (stoppage > 0 && m > fullMin) return `${fullMin}+${m - fullMin}'`;
  if (stoppage > 0 && m > halfMin && m < fullMin) return `${halfMin}+${m - halfMin}'`;
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
