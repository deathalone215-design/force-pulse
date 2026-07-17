import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { matchMutationSelect } from "@/lib/matchState";
import {
  assertWritableLock,
  buildLockClaimData,
  buildLockReleaseData,
  casErrorResponse,
  casUpdateMatch,
  parseExpectedVersion,
  parseLockToken,
} from "@/lib/matchCas";

function parseElapsedSeconds(body) {
  if (body.elapsedSeconds != null) {
    const n = parseInt(body.elapsedSeconds, 10);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(180 * 60, n));
  }
  if (body.setClock != null && body.setClock !== "") {
    const raw = String(body.setClock).trim();
    const m = raw.match(/^(\d{1,3})\s*:\s*(\d{1,2})$/);
    if (!m) return null;
    const mins = parseInt(m[1], 10);
    const secs = parseInt(m[2], 10);
    if (!Number.isFinite(mins) || !Number.isFinite(secs) || secs > 59) return null;
    return Math.max(0, Math.min(180 * 60, mins * 60 + secs));
  }
  return undefined; // not provided
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, resetClock, stoppageMinutes, clockAction, claimLock, releaseLock } =
      body;
    const elapsedParsed = parseElapsedSeconds(body);
    const hasSetClock = elapsedParsed !== undefined;
    const expectedVersion = parseExpectedVersion(body);
    const lockToken = parseLockToken(body);

    const hasStatus = status != null;
    const hasStoppage = stoppageMinutes != null;
    const hasReset = Boolean(resetClock);
    const hasClockAction = clockAction === "pause" || clockAction === "resume";
    const hasLockAction = Boolean(claimLock) || Boolean(releaseLock);

    if (
      !hasStatus &&
      !hasStoppage &&
      !hasReset &&
      !hasClockAction &&
      !hasSetClock &&
      !hasLockAction
    ) {
      return NextResponse.json(
        {
          error:
            "Provide status, stoppageMinutes, resetClock, clockAction, setClock, and/or lock action",
        },
        { status: 400 }
      );
    }

    if (hasSetClock && elapsedParsed === null) {
      return NextResponse.json(
        { error: "Time must look like MM:SS (example 12:30)" },
        { status: 400 }
      );
    }

    const existing = await prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        kickoffAt: true,
        clockPausedAt: true,
        pausedSeconds: true,
        stoppageMinutes: true,
        version: true,
        scoreLockId: true,
        scoreLockedAt: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Lock claim/release can proceed without write lock assert first
    if (!releaseLock && !claimLock) {
      assertWritableLock(existing, lockToken);
    } else if (claimLock) {
      // claiming: only blocked if someone else holds fresh lock
    } else {
      assertWritableLock(existing, lockToken);
    }

    const data = {};
    const now = new Date();

    if (claimLock) {
      Object.assign(data, buildLockClaimData(existing, lockToken) || {});
    }
    if (releaseLock) {
      Object.assign(data, buildLockReleaseData(existing, lockToken) || {});
    }

    if (hasStatus) {
      const validStatuses = ["SCHEDULED", "LIVE", "COMPLETED"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid or missing status" }, { status: 400 });
      }
      data.status = status;

      if (status === "LIVE") {
        if (!existing.kickoffAt || resetClock) {
          data.kickoffAt = now;
          data.clockPausedAt = null;
          data.pausedSeconds = 0;
        }
        // Auto-claim lock when going live if token present
        if (lockToken && !claimLock) {
          try {
            Object.assign(data, buildLockClaimData(existing, lockToken) || {});
          } catch {
            /* already locked by other — assertWritableLock would have thrown */
          }
        }
      } else if (status === "SCHEDULED") {
        data.kickoffAt = null;
        data.clockPausedAt = null;
        data.pausedSeconds = 0;
        data.stoppageMinutes = 0;
        data.penaltyScoreA = 0;
        data.penaltyScoreB = 0;
        data.scoreLockId = null;
        data.scoreLockedAt = null;
      } else if (status === "COMPLETED") {
        if (existing.kickoffAt && !existing.clockPausedAt) {
          data.clockPausedAt = now;
        }
        data.scoreLockId = null;
        data.scoreLockedAt = null;
      }
    }

    if (resetClock && (status === "LIVE" || existing.status === "LIVE" || data.status === "LIVE")) {
      data.kickoffAt = now;
      data.clockPausedAt = null;
      data.pausedSeconds = 0;
      if (status == null) data.status = "LIVE";
    }

    if (hasSetClock) {
      const keepPaused = Boolean(
        data.clockPausedAt !== undefined
          ? data.clockPausedAt
          : existing.clockPausedAt
      );
      data.kickoffAt = new Date(now.getTime() - elapsedParsed * 1000);
      data.pausedSeconds = 0;
      data.clockPausedAt = keepPaused ? now : null;
      if ((data.status || existing.status) !== "LIVE") {
        data.status = "LIVE";
      }
    }

    if (hasClockAction) {
      const liveStatus = data.status || existing.status;
      if (liveStatus !== "LIVE") {
        return NextResponse.json(
          { error: "Pause / resume only works while Live" },
          { status: 400 }
        );
      }
      if (!existing.kickoffAt && !data.kickoffAt) {
        return NextResponse.json(
          { error: "Start the clock before pausing" },
          { status: 400 }
        );
      }

      if (clockAction === "pause") {
        if (!existing.clockPausedAt && data.clockPausedAt == null) {
          data.clockPausedAt = now;
        }
      } else if (clockAction === "resume") {
        const pausedAtRaw = existing.clockPausedAt;
        if (pausedAtRaw) {
          const pausedAt = new Date(pausedAtRaw).getTime();
          const addSec = Math.max(0, Math.floor((now.getTime() - pausedAt) / 1000));
          data.pausedSeconds = (existing.pausedSeconds || 0) + addSec;
          data.clockPausedAt = null;
        } else if (data.clockPausedAt) {
          data.clockPausedAt = null;
        }
      }
    }

    if (hasStoppage) {
      const n = parseInt(stoppageMinutes, 10);
      if (!Number.isFinite(n) || n < 0 || n > 30) {
        return NextResponse.json(
          { error: "Extra time must be 0–30 minutes" },
          { status: 400 }
        );
      }
      data.stoppageMinutes = n;
    }

    if (Object.keys(data).length === 0) {
      const current = await prisma.match.findUnique({
        where: { id },
        select: matchMutationSelect,
      });
      return NextResponse.json(current);
    }

    const updatedMatch = await casUpdateMatch(prisma, id, {
      expectedVersion,
      data,
      select: matchMutationSelect,
    });

    return NextResponse.json(updatedMatch);
  } catch (error) {
    const casRes = casErrorResponse(error);
    if (casRes) return casRes;
    console.error("Failed to update match status:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update match status" },
      { status: 500 }
    );
  }
}
