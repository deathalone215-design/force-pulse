/**
 * Generate schedules for categories that have teams but no rounds.
 * Does NOT touch LSA Football 2026.
 */
require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const pg = require("pg");

const LSA_ID = "0781ebe3-1f0a-4a1c-a25c-88c984567f7d";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function isPlaceholder(name) {
  const n = String(name || "").toLowerCase();
  return (
    n.includes("tbd") ||
    n.includes("placed") ||
    n.includes("winner") ||
    /^w\d+$/i.test(n.trim())
  );
}

function generateRoundRobin(teams) {
  const list = [...teams];
  if (list.length % 2 !== 0) list.push({ id: null });
  const n = list.length;
  const rounds = [];
  for (let rIndex = 0; rIndex < n - 1; rIndex++) {
    const roundMatches = [];
    for (let i = 0; i < n / 2; i++) {
      const home = list[i];
      const away = list[n - 1 - i];
      if (home.id && away.id) {
        roundMatches.push({ teamAId: home.id, teamBId: away.id });
      }
    }
    rounds.push({
      number: rIndex + 1,
      name: `Round ${rIndex + 1}`,
      matches: roundMatches,
    });
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

function generateSwissR1(teams) {
  const ordered = [...teams];
  const matches = [];
  for (let i = 0; i + 1 < ordered.length; i += 2) {
    matches.push({ teamAId: ordered[i].id, teamBId: ordered[i + 1].id });
  }
  return [{ number: 1, name: "Swiss Round 1", matches }];
}

async function main() {
  const categories = await prisma.tournamentCategory.findMany({
    where: { tournamentId: { not: LSA_ID } },
    include: {
      tournament: { select: { name: true } },
      teams: true,
      rounds: { select: { id: true } },
    },
    orderBy: [{ tournament: { name: "asc" } }, { name: "asc" }],
  });

  for (const cat of categories) {
    const real = cat.teams.filter((t) => !isPlaceholder(t.name));
    if (real.length < 2) {
      console.log("skip (need 2+ teams):", cat.tournament.name, cat.name);
      continue;
    }
    if (cat.rounds.length > 0) {
      console.log(
        "skip (already scheduled):",
        cat.tournament.name,
        cat.sport,
        cat.name,
        "rounds=",
        cat.rounds.length
      );
      continue;
    }

    const format = (cat.scheduleFormat || "ROUND_ROBIN").toUpperCase();
    const rounds =
      format === "SWISS" ? generateSwissR1(real) : generateRoundRobin(real);

    const oversLimit =
      cat.sport === "CRICKET" ? cat.oversPerInnings || null : null;

    await prisma.$transaction(async (tx) => {
      await tx.round.deleteMany({ where: { categoryId: cat.id } });
      for (const r of rounds) {
        await tx.round.create({
          data: {
            number: r.number,
            name: r.name || null,
            categoryId: cat.id,
            matches: {
              create: r.matches.map((m) => ({
                teamAId: m.teamAId,
                teamBId: m.teamBId,
                status: "SCHEDULED",
                scoreA: 0,
                scoreB: 0,
                oversLimit,
              })),
            },
          },
        });
      }
    });

    const matchCount = rounds.reduce((s, r) => s + r.matches.length, 0);
    console.log(
      "generated:",
      cat.tournament.name,
      "·",
      cat.sport,
      cat.name,
      "·",
      format,
      "·",
      rounds.length,
      "rounds /",
      matchCount,
      "matches"
    );
  }

  console.log("\nDone. LSA untouched.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
