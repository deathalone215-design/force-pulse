import { NextResponse } from "next/server";
import { matchMutationSelect } from "@/lib/matchState";

export class MatchConflictError extends Error {
  constructor(current) {
    super("Match was updated elsewhere. Refresh and try again.");
    this.name = "MatchConflictError";
    this.current = current;
    this.status = 409;
  }
}

export class MatchLockedError extends Error {
  constructor(current) {
    super("Another scorer holds the lock on this match.");
    this.name = "MatchLockedError";
    this.current = current;
    this.status = 423;
  }
}

const LOCK_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export function parseExpectedVersion(body) {
  if (body == null || body.expectedVersion == null || body.expectedVersion === "") {
    return null;
  }
  const n = parseInt(body.expectedVersion, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseLockToken(body) {
  if (!body?.lockToken || typeof body.lockToken !== "string") return null;
  const t = body.lockToken.trim();
  return t.length > 0 ? t : null;
}

function lockExpired(match) {
  if (!match?.scoreLockedAt) return true;
  const t = new Date(match.scoreLockedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > LOCK_TTL_MS;
}

/** Reject writes when another device holds a fresh lock. */
export function assertWritableLock(match, lockToken) {
  if (!match?.scoreLockId) return;
  if (lockExpired(match)) return;
  if (lockToken && lockToken === match.scoreLockId) return;
  throw new MatchLockedError(match);
}

export function buildLockClaimData(match, lockToken) {
  if (!lockToken) return null;
  if (
    match.scoreLockId &&
    match.scoreLockId !== lockToken &&
    !lockExpired(match)
  ) {
    throw new MatchLockedError(match);
  }
  return {
    scoreLockId: lockToken,
    scoreLockedAt: new Date(),
  };
}

export function buildLockReleaseData(match, lockToken) {
  if (!lockToken) return null;
  if (match.scoreLockId && match.scoreLockId !== lockToken && !lockExpired(match)) {
    throw new MatchLockedError(match);
  }
  return {
    scoreLockId: null,
    scoreLockedAt: null,
  };
}

/**
 * Compare-and-swap update on Match.version.
 * When expectedVersion is null, still increments version (legacy callers).
 */
export async function casUpdateMatch(
  db,
  matchId,
  { expectedVersion, data, select = matchMutationSelect, include }
) {
  const where =
    expectedVersion == null
      ? { id: matchId }
      : { id: matchId, version: expectedVersion };

  const result = await db.match.updateMany({
    where,
    data: {
      ...data,
      version: { increment: 1 },
    },
  });

  if (result.count === 0) {
    const current = await db.match.findUnique({
      where: { id: matchId },
      ...(include ? { include } : { select }),
    });
    if (!current) {
      const err = new Error("Match not found");
      err.status = 404;
      throw err;
    }
    throw new MatchConflictError(current);
  }

  return db.match.findUnique({
    where: { id: matchId },
    ...(include ? { include } : { select }),
  });
}

export function casErrorResponse(error) {
  if (error instanceof MatchConflictError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "VERSION_CONFLICT",
        match: error.current,
      },
      { status: 409 }
    );
  }
  if (error instanceof MatchLockedError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "SCORE_LOCKED",
        match: error.current,
      },
      { status: 423 }
    );
  }
  if (error?.status === 404) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  return null;
}
