import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  getConfig,
  getSetWinner,
  getMatchWinner,
} from "@/lib/setBasedSports";

async function getMatchWithContext(matchId) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      matchSets: { orderBy: { setNumber: "asc" } },
      round: {
        include: {
          category: {
            select: { id: true, sport: true, oversPerInnings: true },
          },
        },
      },
    },
  });
  return match;
}

export async function GET(request, { params }) {
  try {
    const { id: matchId } = await params;
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
  try {
    const { id: matchId } = await params;
    const { team } = await request.json();

    if (team !== "A" && team !== "B") {
      return NextResponse.json({ error: "team must be A or B" }, { status: 400 });
    }

    const match = await getMatchWithContext(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    if (match.status === "COMPLETED") {
      return NextResponse.json({ error: "Match is already completed" }, { status: 400 });
    }

    const sport = match.round.category.sport;
    const config = getConfig(sport);
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

        await tx.match.update({
          where: { id: matchId },
          data: {
            scoreA: newSetsWonA,
            scoreB: newSetsWonB,
            currentSet: matchWinner ? currentSetNum : currentSetNum + 1,
            status: matchWinner ? "COMPLETED" : match.status,
          },
        });
      }
    });

    const updated = await getMatchWithContext(matchId);
    return NextResponse.json({ sets: updated.matchSets, match: updated });
  } catch (err) {
    console.error("set-point POST error:", err);
    return NextResponse.json({ error: "Failed to add point" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id: matchId } = await params;

    const match = await getMatchWithContext(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const sport = match.round.category.sport;
    const config = getConfig(sport);
    if (!config) {
      return NextResponse.json({ error: "Not a set-based sport" }, { status: 400 });
    }

    const currentSetNum = match.currentSet;
    const currentSet = match.matchSets.find((s) => s.setNumber === currentSetNum);

    if (!currentSet || (currentSet.scoreA === 0 && currentSet.scoreB === 0)) {
      // Roll back to previous set if current set is empty
      if (currentSetNum > 1) {
        const prevSet = match.matchSets.find((s) => s.setNumber === currentSetNum - 1);
        if (prevSet) {
          await prisma.$transaction(async (tx) => {
            // Undo the set win: recalculate sets won
            const wasWonByA = prevSet.winnerId === match.teamAId;
            await tx.matchSet.update({
              where: { id: prevSet.id },
              data: { winnerId: null },
            });
            await tx.match.update({
              where: { id: matchId },
              data: {
                currentSet: currentSetNum - 1,
                scoreA: match.scoreA - (wasWonByA ? 1 : 0),
                scoreB: match.scoreB - (wasWonByA ? 0 : 1),
                status: "LIVE",
              },
            });
          });
        }
      }
      const updated = await getMatchWithContext(matchId);
      return NextResponse.json({ sets: updated.matchSets, match: updated });
    }

    // Remove last point from current set
    const lastWasA = currentSet.scoreA > 0 && (currentSet.scoreB === 0 || currentSet.scoreA > currentSet.scoreB || true);
    // We don't know which team scored last, so we need to check if there was a winner before
    // Simple approach: if set had a winner, undo the winner state too
    const hadWinner = !!currentSet.winnerId;

    await prisma.$transaction(async (tx) => {
      const newScoreA = hadWinner && currentSet.winnerId === match.teamAId
        ? currentSet.scoreA - 1
        : currentSet.winnerId === match.teamBId
          ? currentSet.scoreA
          : currentSet.scoreA; // fallback - caller picks team via DELETE body

      // We'll use query param to determine which team to subtract from
      const { searchParams } = new URL(request.url);
      const team = searchParams.get("team");

      const undoA = team === "A" ? Math.max(0, currentSet.scoreA - 1) : currentSet.scoreA;
      const undoB = team === "B" ? Math.max(0, currentSet.scoreB - 1) : currentSet.scoreB;

      const setWinner = getSetWinner(undoA, undoB, currentSetNum, config);

      await tx.matchSet.update({
        where: { id: currentSet.id },
        data: {
          scoreA: undoA,
          scoreB: undoB,
          winnerId: setWinner
            ? setWinner === "A" ? match.teamAId : match.teamBId
            : null,
        },
      });

      if (hadWinner && !setWinner) {
        const wasWonByA = currentSet.winnerId === match.teamAId;
        await tx.match.update({
          where: { id: matchId },
          data: {
            scoreA: Math.max(0, match.scoreA - (wasWonByA ? 1 : 0)),
            scoreB: Math.max(0, match.scoreB - (wasWonByA ? 0 : 1)),
            status: match.status === "COMPLETED" ? "LIVE" : match.status,
          },
        });
      }
    });

    const updated = await getMatchWithContext(matchId);
    return NextResponse.json({ sets: updated.matchSets, match: updated });
  } catch (err) {
    console.error("set-point DELETE error:", err);
    return NextResponse.json({ error: "Failed to undo point" }, { status: 500 });
  }
}
