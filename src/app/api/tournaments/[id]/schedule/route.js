import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  isKnockoutWinnerPlaceholder,
  normalizeScheduleFormat,
} from "@/lib/scheduleFormats";

async function resolveMatchTeamIds(categoryId, match) {
  async function resolveSide(idKey, nameKey) {
    if (match[idKey]) return match[idKey];
    const name = match[nameKey] ? String(match[nameKey]).trim() : "";
    if (!name) {
      throw new Error(`Match is missing ${idKey} / ${nameKey}`);
    }
    let team = await prisma.team.findFirst({
      where: { categoryId, name },
    });
    if (!team) {
      team = await prisma.team.create({
        data: { categoryId, name },
      });
    }
    return team.id;
  }

  const teamAId = await resolveSide("teamAId", "teamAName");
  const teamBId = await resolveSide("teamBId", "teamBName");
  return { teamAId, teamBId };
}

/** Remove auto-created knockout winner placeholders that are no longer needed. */
async function cleanupKnockoutPlaceholders(categoryId) {
  const placeholders = await prisma.team.findMany({
    where: { categoryId },
    select: { id: true, name: true },
  });
  const winnerIds = placeholders
    .filter((t) => isKnockoutWinnerPlaceholder(t.name))
    .map((t) => t.id);
  if (winnerIds.length === 0) return;
  // Only delete if not referenced by remaining matches (after round wipe they shouldn't be)
  await prisma.team.deleteMany({
    where: { id: { in: winnerIds }, categoryId },
  });
}

export async function POST(request, { params }) {
  try {
    const { id: tournamentId } = await params;
    const body = await request.json();
    const { rounds, categoryId, format, mode = "replace" } = body;

    if (!categoryId) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    if (!rounds || !Array.isArray(rounds)) {
      return NextResponse.json({ error: "Rounds array is required" }, { status: 400 });
    }

    const category = await prisma.tournamentCategory.findFirst({
      where: { id: categoryId, tournamentId },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Category not found in this tournament" },
        { status: 404 }
      );
    }

    const oversLimit =
      category.sport === "CRICKET" ? category.oversPerInnings || null : null;

    const scheduleFormat = format
      ? normalizeScheduleFormat(format)
      : category.scheduleFormat || "ROUND_ROBIN";

    if (mode === "append") {
      if (rounds.length === 0) {
        return NextResponse.json({ error: "No round to append" }, { status: 400 });
      }

      const maxRound = await prisma.round.findFirst({
        where: { categoryId },
        orderBy: { number: "desc" },
      });
      const nextNumber =
        rounds[0].number != null
          ? parseInt(rounds[0].number, 10)
          : (maxRound?.number || 0) + 1;

      const clash = await prisma.round.findFirst({
        where: { categoryId, number: nextNumber },
      });
      if (clash) {
        return NextResponse.json(
          { error: `Round ${nextNumber} already exists` },
          { status: 400 }
        );
      }

      const r = rounds[0];
      const matchCreates = [];
      for (const m of r.matches || []) {
        const ids = await resolveMatchTeamIds(categoryId, m);
        matchCreates.push({
          ...ids,
          status: "SCHEDULED",
          scoreA: 0,
          scoreB: 0,
          oversLimit,
        });
      }

      if (format) {
        await prisma.tournamentCategory.update({
          where: { id: categoryId },
          data: { scheduleFormat },
        });
      }

      const round = await prisma.round.create({
        data: {
          number: nextNumber,
          name: r.name != null && String(r.name).trim() ? String(r.name).trim() : null,
          categoryId,
          matches: { create: matchCreates },
        },
        include: {
          matches: {
            include: { teamA: true, teamB: true },
          },
        },
      });

      return NextResponse.json([round], { status: 201 });
    }

    // Replace mode: wipe category rounds, then recreate
    await prisma.round.deleteMany({ where: { categoryId } });
    await cleanupKnockoutPlaceholders(categoryId);

    await prisma.tournamentCategory.update({
      where: { id: categoryId },
      data: { scheduleFormat },
    });

    const createdRounds = [];

    for (const r of rounds) {
      const matchCreates = [];
      for (const m of r.matches || []) {
        const ids = await resolveMatchTeamIds(categoryId, m);
        matchCreates.push({
          ...ids,
          status: "SCHEDULED",
          scoreA: 0,
          scoreB: 0,
          oversLimit,
        });
      }

      const round = await prisma.round.create({
        data: {
          number: parseInt(r.number, 10) || 1,
          name: r.name != null && String(r.name).trim() ? String(r.name).trim() : null,
          categoryId,
          matches: { create: matchCreates },
        },
        include: {
          matches: {
            include: { teamA: true, teamB: true },
          },
        },
      });
      createdRounds.push(round);
    }

    return NextResponse.json(createdRounds, { status: 201 });
  } catch (error) {
    console.error("Failed to save schedule:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save schedule" },
      { status: 500 }
    );
  }
}
