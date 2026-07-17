/**
 * Client helpers for match CAS + optional score lock.
 */

const LOCK_KEY = (matchId) => `fp_score_lock_${matchId}`;

export function getScoreLockToken(matchId) {
  if (typeof window === "undefined" || !matchId) return null;
  try {
    let token = window.sessionStorage.getItem(LOCK_KEY(matchId));
    if (!token) {
      token =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `lock_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(LOCK_KEY(matchId), token);
    }
    return token;
  } catch {
    return null;
  }
}

/** Fields to merge into every match mutation body. */
export function casFields(match, matchId) {
  const fields = {
    expectedVersion: match?.version ?? 0,
  };
  const lockToken = getScoreLockToken(matchId || match?.id);
  if (lockToken) fields.lockToken = lockToken;
  return fields;
}

export function isCasConflict(res, data) {
  return res?.status === 409 || data?.code === "VERSION_CONFLICT";
}

export function isScoreLocked(res, data) {
  return res?.status === 423 || data?.code === "SCORE_LOCKED";
}

export function casErrorMessage(res, data, fallback = "Request failed") {
  if (isCasConflict(res, data)) {
    return data?.error || "Match was updated on another device. Refreshed — try again.";
  }
  if (isScoreLocked(res, data)) {
    return data?.error || "Another scorer holds the lock on this match.";
  }
  return data?.error || fallback;
}
