import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  getConfig,
  getSetWinner,
  getMatchWinner,
} from "@/lib/setBasedSports";
import {
  assertWritableLock,
  casErrorResponse,
  casUpdateMatch,
  parseExpectedVersion,
  parseLockToken,
} from "@/lib/matchCas";
import { requireMatchAccess } from "@/lib/accessControl";

async function getMatchWithContext(matchId) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      matchSets: { orderBy: { setNumber: "asc" } },
      round: {
        include: {
          category: {
            select: {
              id: true,
              sport: true,
              oversPerInnings: true,
              pointsPerSet: true,
              setsToWin: true,
              maxSets: true,
              lastSetPoints: true,
              pointCap: true,
            },
          },
        },
      },
    },
  });
  return match;
}

export async function GET(request, { params }) {
  const { id: matchId } = await params;
  const gate = await requireMatchAccess(request, matchId);
  if (gate.error) return gate.error;

  try {
    const match = await getMatchWithContext(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    return NextResponse.json({ sets: match.matchSets, currentSet: match.currentSet });
  } catch (err) {
    console.error("set-point GET error:", err);
    return NextResponse.json({ error: "Failed to fetch sets" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { id: matchId } = await params;
  const gate = await requireMatchAccess(request, matchId);
  if (gate.error) return gate.error;

  try {
    const body = await request.json();
    const { team } = body;
    const expectedVersion = parseExpectedVersion(body);
    const lockToken = parseLockToken(body);

    if (team !== "A" && team !== "B") {
      return NextResponse.json({ error: "team must be A or B" }, { status: 400 });
    }

    const match = await getMatchWithContext(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    assertWritableLock(match, lockToken);
    if (match.status === "COMPLETED") {
      return NextResponse.json({ error: "Match is already completed" }, { status: 400 });
    }

    const sport = match.round.category.sport;
    const config = getConfig(sport, match.round.category);
    if (!config) {
      return NextResponse.json({ error: "Not a set-based sport" }, { status: 400 });
    }

    const currentSetNum = match.currentSet;
    let currentSet = match.matchSets.find((s) => s.setNumber === currentSetNum);

    await prisma.$transaction(async (tx) => {
      if (!currentSet) {
        currentSet = await tx.matchSet.create({
          data: { matchId, setNumber: currentSetNum, scoreA: 0, scoreB: 0 },
        });
      }

      const newScoreA = team === "A" ? currentSet.scoreA + 1 : currentSet.scoreA;
      const newScoreB = team === "B" ? currentSet.scoreB + 1 : currentSet.scoreB;

      const setWinner = getSetWinner(newScoreA, newScoreB, currentSetNum, config);

      await tx.matchSet.update({
        where: { id: currentSet.id },
        data: {
          scoreA: newScoreA,
          scoreB: newScoreB,
          winnerId: setWinner
            ? setWinner === "A"
              ? match.teamAId
              : match.teamBId
            : null,
        },
      });

      if (setWinner) {
        const newSetsWonA = match.scoreA + (setWinner === "A" ? 1 : 0);
        const newSetsWonB = match.scoreB + (setWinner === "B" ? 1 : 0);
        const matchWinner = getMatchWinner(newSetsWonA, newSetsWonB, config);

        await casUpdateMatch(tx, matchId, {
          expectedVersion,
          include: { matchSets: { orderBy: { setNumber: "asc" } } },
          data: {
            scoreA: newSetsWonA,
            scoreB: newSetsWonB,
            currentSet: matchWinner ? currentSetNum : currentSetNum + 1,
            status: matchWinner ? "COMPLETED" : match.status,
          },
        });
      } else {
        // Touch version even when only set score changes
        await casUpdateMatch(tx, matchId, {
          expectedVersion,
          include: { matchSets: { orderBy: { setNumber: "asc" } } },
          data: {},
        });
      }
    });

    const updated = await getMatchWithContext(matchId);
    return NextResponse.json({ sets: updated.matchSets, match: updated });
  } catch (err) {
    const casRes = casErrorResponse(err);
    if (casRes) return casRes;
    console.error("set-point POST error:", err);
    return NextResponse.json({ error: "Failed to add point" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { id: matchId } = await params;
  const gate = await requireMatchAccess(request, matchId);
  if (gate.error) return gate.error;

  try {
    const { searchParams } = new URL(request.url);
    const team = searchParams.get("team");
    let expectedVersion = searchParams.get("expectedVersion");
    let lockToken = searchParams.get("lockToken");
    try {
      const body = await request.json();
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

    const match = await getMatchWithContext(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    assertWritableLock(match, lockToken);

    const sport = match.round.category.sport;
    const config = getConfig(sport, match.round.category);
    if (!config) {
      return NextResponse.json({ error: "Not a set-based sport" }, { status: 400 });
    }

    const currentSetNum = match.currentSet;
    const currentSet = match.matchSets.find((s) => s.setNumber === currentSetNum);

    if (!currentSet || (currentSet.scoreA === 0 && currentSet.scoreB === 0)) {
      if (currentSetNum > 1) {
        const prevSet = match.matchSets.find((s) => s.setNumber === currentSetNum - 1);
        if (prevSet) {
          await prisma.$transaction(async (tx) => {
            const wasWonByA = prevSet.winnerId === match.teamAId;
            // Also remove the winning rally so score is playable again (e.g. 21-19 → 20-19)
            const undoA = wasWonByA
              ? Math.max(0, prevSet.scoreA - 1)
              : prevSet.scoreA;
            const undoB = !wasWonByA && prevSet.winnerId
              ? Math.max(0, prevSet.scoreB - 1)
              : prevSet.scoreB;
            await tx.matchSet.update({
              where: { id: prevSet.id },
              data: {
                winnerId: null,
                scoreA: undoA,
                scoreB: undoB,
              },
            });
            await casUpdateMatch(tx, matchId, {
              expectedVersion,
              data: {
                currentSet: currentSetNum - 1,
                scoreA: Math.max(0, match.scoreA - (wasWonByA ? 1 : 0)),
                scoreB: Math.max(0, match.scoreB - (wasWonByA ? 0 : 1)),
                status: "LIVE",
              },
            });
          });
        }
      }
      const updated = await getMatchWithContext(matchId);
      return NextResponse.json({ sets: updated.matchSets, match: updated });
    }

    const hadWinner = !!currentSet.winnerId;

    await prisma.$transaction(async (tx) => {
      const undoA = team === "A" ? Math.max(0, currentSet.scoreA - 1) : currentSet.scoreA;
      const undoB = team === "B" ? Math.max(0, currentSet.scoreB - 1) : currentSet.scoreB;

      const setWinner = getSetWinner(undoA, undoB, currentSetNum, config);

      await tx.matchSet.update({
        where: { id: currentSet.id },
        data: {
          scoreA: undoA,
          scoreB: undoB,
          winnerId: setWinner
            ? setWinner === "A"
              ? match.teamAId
              : match.teamBId
            : null,
        },
      });

      if (hadWinner && !setWinner) {
        const wasWonByA = currentSet.winnerId === match.teamAId;
        await casUpdateMatch(tx, matchId, {
          expectedVersion,
          data: {
            scoreA: Math.max(0, match.scoreA - (wasWonByA ? 1 : 0)),
            scoreB: Math.max(0, match.scoreB - (wasWonByA ? 0 : 1)),
            status: match.status === "COMPLETED" ? "LIVE" : match.status,
          },
        });
      } else {
        await casUpdateMatch(tx, matchId, {
          expectedVersion,
          data: {},
        });
      }
    });

    const updated = await getMatchWithContext(matchId);
    return NextResponse.json({ sets: updated.matchSets, match: updated });
  } catch (err) {
    const casRes = casErrorResponse(err);
    if (casRes) return casRes;
    console.error("set-point DELETE error:", err);
    return NextResponse.json({ error: "Failed to undo point" }, { status: 500 });
  }
}
