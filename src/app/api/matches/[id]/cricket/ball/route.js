import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import {
  ballsToOvers,
  computeRunsTotal,
  isInningsComplete,
  isLegalExtra,
  nextBallPosition,
  oversToMaxBalls,
  recomputeFromBalls,
  shouldSwapStrike,
  strikeRotationRuns,
} from "@/lib/cricket";
import {
  assertWritableLock,
  casErrorResponse,
  casUpdateMatch,
  parseExpectedVersion,
  parseLockToken,
} from "@/lib/matchCas";

function loadMatch(matchId) {
  return prisma.match.findUnique({
    where: { id: matchId },
    include: {
      cricketBalls: { orderBy: { createdAt: "asc" } },
      teamA: { include: { players: true } },
      teamB: { include: { players: true } },
      round: {
        include: {
          category: { include: { tournament: true } },
        },
      },
    },
  });
}

export async function POST(request, { params }) {
  try {
    const { id: matchId } = await params;
    const body = await request.json();
    const expectedVersion = parseExpectedVersion(body);
    const lockToken = parseLockToken(body);
    const {
      runsOffBat = 0,
      extras = 0,
      extraType = null,
      isWicket = false,
      dismissalType = null,
      dismissedPlayerId = null,
      newStrikerId = null, // after wicket
    } = body;

    const match = await loadMatch(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    assertWritableLock(match, lockToken);
    if (match.round?.category?.sport !== "CRICKET") {
      return NextResponse.json({ error: "Not a cricket match" }, { status: 400 });
    }
    if (match.status !== "LIVE") {
      return NextResponse.json({ error: "Match is not live" }, { status: 400 });
    }
    if (!match.battingTeamId || !match.strikerId || !match.nonStrikerId || !match.bowlerId) {
      return NextResponse.json(
        { error: "Set batting lineup before scoring" },
        { status: 400 }
      );
    }

    // First innings closed — waiting for 2nd innings start
    if (match.currentInnings === 1 && match.inningsComplete >= 1) {
      return NextResponse.json(
        { error: "Start the second innings before scoring more balls" },
        { status: 400 }
      );
    }

    const isA = match.battingTeamId === match.teamAId;
    const legalSoFar = isA ? match.ballsFacedA : match.ballsFacedB;
    const maxBalls = oversToMaxBalls(match.oversLimit);
    if (maxBalls > 0 && legalSoFar >= maxBalls) {
      return NextResponse.json({ error: "Overs complete for this innings" }, { status: 400 });
    }

    const wickets = isA ? match.wicketsA : match.wicketsB;
    if (wickets >= 10) {
      return NextResponse.json({ error: "All out" }, { status: 400 });
    }

    const extra = extraType || null;
    const legal = isLegalExtra(extra);
    const runsBat = Math.max(0, parseInt(runsOffBat, 10) || 0);
    let extrasVal = Math.max(0, parseInt(extras, 10) || 0);
    if (extra === "WD" || extra === "NB") {
      extrasVal = Math.max(1, extrasVal);
    }
    if ((extra === "BYE" || extra === "LB") && extrasVal < 1) {
      return NextResponse.json({ error: "Byes/leg-byes need at least 1 run" }, { status: 400 });
    }

    const runsTotal = computeRunsTotal({
      runsOffBat: runsBat,
      extras: extrasVal,
      extraType: extra,
    });

    const { overNumber, ballInOver } = legal
      ? nextBallPosition(legalSoFar)
      : {
          overNumber: Math.floor(legalSoFar / 6),
          ballInOver: 0,
        };

    let dismissedId = dismissedPlayerId || null;
    if (isWicket && !dismissedId) {
      dismissedId = match.strikerId;
    }

    const result = await prisma.$transaction(async (tx) => {
      const ball = await tx.cricketBall.create({
        data: {
          matchId,
          innings: match.currentInnings,
          overNumber,
          ballInOver,
          battingTeamId: match.battingTeamId,
          strikerId: match.strikerId,
          nonStrikerId: match.nonStrikerId,
          bowlerId: match.bowlerId,
          runsOffBat: runsBat,
          extras: extrasVal,
          extraType: extra,
          isWicket: !!isWicket,
          dismissalType: isWicket ? dismissalType || "OTHER" : null,
          dismissedPlayerId: isWicket ? dismissedId : null,
          runsTotal,
          isLegal: legal,
        },
      });

      const newLegal = legalSoFar + (legal ? 1 : 0);
      const overJustCompleted = legal && newLegal > 0 && newLegal % 6 === 0;

      let strikerId = match.strikerId;
      let nonStrikerId = match.nonStrikerId;
      let bowlerId = match.bowlerId;

      if (isWicket) {
        const outId = dismissedId;
        const survivor =
          outId === match.strikerId ? match.nonStrikerId : match.strikerId;
        if (!newStrikerId) {
          // Clear striker slot — UI must pick next batsman
          strikerId = null;
          nonStrikerId = survivor;
        } else {
          strikerId = newStrikerId;
          nonStrikerId = survivor;
        }
      } else {
        const rot = strikeRotationRuns({
          runsOffBat: runsBat,
          extras: extrasVal,
          extraType: extra,
          isWicket: false,
        });
        if (shouldSwapStrike(rot, overJustCompleted)) {
          strikerId = match.nonStrikerId;
          nonStrikerId = match.strikerId;
        }
      }

      if (overJustCompleted && !isWicket) {
        // Force bowler change UI — clear bowler so admin picks next
        bowlerId = null;
      }

      const scoreField = isA ? "scoreA" : "scoreB";
      const wicketField = isA ? "wicketsA" : "wicketsB";
      const ballsField = isA ? "ballsFacedA" : "ballsFacedB";

      const data = {
        [scoreField]: (isA ? match.scoreA : match.scoreB) + runsTotal,
        [wicketField]: (isA ? match.wicketsA : match.wicketsB) + (isWicket ? 1 : 0),
        [ballsField]: newLegal,
        strikerId,
        nonStrikerId,
        bowlerId,
      };

      // Preview completion against provisional scores
      const provisional = { ...match, ...data };
      if (match.currentInnings === 2) {
        const chasingRuns = isA ? data.scoreA : data.scoreB;
        const target =
          (match.battingTeamId === match.teamAId ? match.scoreB : match.scoreA) + 1;
        if (chasingRuns >= target) {
          data.status = "COMPLETED";
          data.inningsComplete = 2;
        }
      }

      if (
        (data.status || match.status) === "LIVE" &&
        isInningsComplete({ ...provisional, ...data }, match.battingTeamId)
      ) {
        if (match.currentInnings === 1) {
          data.inningsComplete = 1;
          data.strikerId = null;
          data.nonStrikerId = null;
          data.bowlerId = null;
        } else if (data.status !== "COMPLETED") {
          data.status = "COMPLETED";
          data.inningsComplete = 2;
        }
      }

      await casUpdateMatch(tx, matchId, {
        expectedVersion,
        data,
      });

      const full = await tx.match.findUnique({
        where: { id: matchId },
        include: {
          cricketBalls: { orderBy: { createdAt: "asc" } },
        },
      });

      return { ball, match: full, overJustCompleted, oversDisplay: ballsToOvers(newLegal) };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const casRes = casErrorResponse(error);
    if (casRes) return casRes;
    console.error("Failed to add cricket ball:", error);
    return NextResponse.json({ error: "Failed to add ball" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id: matchId } = await params;
    const { searchParams } = new URL(request.url);
    let ballId = searchParams.get("ballId");
    let expectedVersion = searchParams.get("expectedVersion");
    let lockToken = searchParams.get("lockToken");
    try {
      const body = await request.json();
      if (body?.ballId) ballId = body.ballId;
      if (body?.expectedVersion != null) expectedVersion = body.expectedVersion;
      if (body?.lockToken) lockToken = body.lockToken;
    } catch {
      /* no body */
    }
    expectedVersion =
      expectedVersion != null && expectedVersion !== ""
        ? parseInt(expectedVersion, 10)
        : null;
    if (!Number.isFinite(expectedVersion)) expectedVersion = null;

    const match = await loadMatch(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    assertWritableLock(match, lockToken);

    const balls = match.cricketBalls || [];
    if (balls.length === 0) {
      return NextResponse.json({ error: "No balls to undo" }, { status: 400 });
    }

    if (!ballId) {
      ballId = balls[balls.length - 1].id;
    }

    const idx = balls.findIndex((b) => b.id === ballId);
    if (idx < 0) {
      return NextResponse.json({ error: "Ball not found" }, { status: 404 });
    }

    const last = balls[balls.length - 1];
    if (ballId !== last.id) {
      return NextResponse.json(
        { error: "Only the last ball can be undone" },
        { status: 400 }
      );
    }

    const remaining = balls.slice(0, -1);
    const totals = recomputeFromBalls(match, remaining);

    let currentInnings = 1;
    let battingTeamId = null;
    let strikerId = null;
    let nonStrikerId = null;
    let bowlerId = null;
    let status = match.status === "COMPLETED" ? "LIVE" : match.status;

    if (remaining.length === 0) {
      battingTeamId = match.battingTeamId;
      status = "LIVE";
      currentInnings = 1;
    } else {
      const lastBall = remaining[remaining.length - 1];
      currentInnings = lastBall.innings;
      battingTeamId = lastBall.battingTeamId;
      strikerId = lastBall.strikerId;
      nonStrikerId = lastBall.nonStrikerId;
      bowlerId = lastBall.bowlerId;

      const inn1Done =
        remaining.some((b) => b.innings === 1) &&
        !remaining.some((b) => b.innings === 2)
          ? (() => {
              const mock = {
                ...match,
                ...totals,
                oversLimit: match.oversLimit,
                battingTeamId: remaining.find((b) => b.innings === 1).battingTeamId,
              };
              return isInningsComplete(mock, mock.battingTeamId);
            })()
          : remaining.some((b) => b.innings === 2);

      if (remaining.some((b) => b.innings === 2)) {
        currentInnings = 2;
        battingTeamId = lastBall.battingTeamId;
      } else if (inn1Done) {
        currentInnings = 1;
        battingTeamId = remaining.find((b) => b.innings === 1).battingTeamId;
        strikerId = null;
        nonStrikerId = null;
        bowlerId = null;
      } else {
        currentInnings = 1;
      }

      status = "LIVE";
    }

    const inningsComplete = remaining.some((b) => b.innings === 2)
      ? 1
      : remaining.length > 0 &&
          isInningsComplete(
            { ...match, ...totals, oversLimit: match.oversLimit },
            remaining[remaining.length - 1].battingTeamId
          ) &&
          !remaining.some((b) => b.innings === 2)
        ? 1
        : 0;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.cricketBall.delete({ where: { id: ballId } });
      return casUpdateMatch(tx, matchId, {
        expectedVersion,
        data: {
          ...totals,
          currentInnings,
          inningsComplete,
          battingTeamId: battingTeamId || match.battingTeamId,
          strikerId,
          nonStrikerId,
          bowlerId,
          status,
        },
        include: {
          cricketBalls: { orderBy: { createdAt: "asc" } },
        },
      });
    });

    return NextResponse.json({ match: updated });
  } catch (error) {
    const casRes = casErrorResponse(error);
    if (casRes) return casRes;
    console.error("Failed to undo cricket ball:", error);
    return NextResponse.json({ error: "Failed to undo ball" }, { status: 500 });
  }
}
