import { isPlaceholderTeam } from "@/lib/tournamentResolver";

export const SET_BASED_SPORTS = ["VOLLEYBALL", "BADMINTON", "PICKLEBALL"];

export const SPORT_CONFIGS = {
  VOLLEYBALL: {
    name: "Volleyball",
    icon: "🏐",
    setsToWin: 3,
    maxSets: 5,
    pointsPerSet: 25,
    lastSetPoints: 15,
    winByTwo: true,
    pointCap: null,
  },
  BADMINTON: {
    name: "Badminton",
    icon: "🏸",
    setsToWin: 2,
    maxSets: 3,
    pointsPerSet: 21,
    lastSetPoints: 21,
    winByTwo: true,
    pointCap: 30,
  },
  PICKLEBALL: {
    name: "Pickleball",
    icon: "🏓",
    setsToWin: 2,
    maxSets: 3,
    pointsPerSet: 11,
    lastSetPoints: 11,
    winByTwo: true,
    pointCap: null,
  },
};

export function isSetBasedSport(sport) {
  return SET_BASED_SPORTS.includes(String(sport || "").toUpperCase().trim());
}

export function getConfig(sport, category = null) {
  const base = SPORT_CONFIGS[normalizeSportKey(sport)];
  if (!base) return null;
  if (!category) return { ...base };

  const pointsPerSet =
    Number.isFinite(parseInt(category.pointsPerSet, 10)) &&
    parseInt(category.pointsPerSet, 10) > 0
      ? parseInt(category.pointsPerSet, 10)
      : base.pointsPerSet;
  const setsToWin =
    Number.isFinite(parseInt(category.setsToWin, 10)) &&
    parseInt(category.setsToWin, 10) > 0
      ? parseInt(category.setsToWin, 10)
      : base.setsToWin;
  const maxSetsRaw = parseInt(category.maxSets, 10);
  const maxSets =
    Number.isFinite(maxSetsRaw) && maxSetsRaw >= setsToWin
      ? maxSetsRaw
      : Math.max(setsToWin * 2 - 1, setsToWin);
  const lastSetRaw = parseInt(category.lastSetPoints, 10);
  const lastSetPoints =
    Number.isFinite(lastSetRaw) && lastSetRaw > 0
      ? lastSetRaw
      : category.pointsPerSet != null
        ? pointsPerSet
        : base.lastSetPoints;
  const capRaw = category.pointCap;
  const pointCap =
    capRaw === null || capRaw === ""
      ? null
      : Number.isFinite(parseInt(capRaw, 10)) && parseInt(capRaw, 10) > 0
        ? parseInt(capRaw, 10)
        : base.pointCap;

  return {
    ...base,
    pointsPerSet,
    setsToWin,
    maxSets,
    lastSetPoints,
    pointCap,
  };
}

function normalizeSportKey(sport) {
  return String(sport || "").toUpperCase().trim();
}

/** Defaults used when creating a set-based category in admin. */
export function defaultSetScoring(sport) {
  const base = SPORT_CONFIGS[normalizeSportKey(sport)];
  if (!base) return null;
  return {
    pointsPerSet: base.pointsPerSet,
    setsToWin: base.setsToWin,
    maxSets: base.maxSets,
    lastSetPoints: base.lastSetPoints,
    pointCap: base.pointCap,
  };
}

export function getSetTarget(setNumber, config) {
  const isLastSet = setNumber >= config.maxSets;
  return isLastSet ? config.lastSetPoints : config.pointsPerSet;
}

export function getSetWinner(scoreA, scoreB, setNumber, config) {
  const target = getSetTarget(setNumber, config);
  const cap = config.pointCap;

  if (cap && (scoreA >= cap || scoreB >= cap)) {
    if (scoreA > scoreB) return "A";
    if (scoreB > scoreA) return "B";
    return null;
  }

  if (config.winByTwo) {
    const diff = Math.abs(scoreA - scoreB);
    if (scoreA >= target && diff >= 2) return "A";
    if (scoreB >= target && diff >= 2) return "B";
    return null;
  }

  if (scoreA >= target) return "A";
  if (scoreB >= target) return "B";
  return null;
}

export function isMatchWon(setsWonA, setsWonB, config) {
  return setsWonA >= config.setsToWin || setsWonB >= config.setsToWin;
}

export function getMatchWinner(setsWonA, setsWonB, config) {
  if (setsWonA >= config.setsToWin) return "A";
  if (setsWonB >= config.setsToWin) return "B";
  return null;
}

export function formatSetScore(sets, teamAId) {
  return sets
    .filter((s) => s.winnerId)
    .map((s) => {
      const isA = s.winnerId === teamAId;
      return isA ? `${s.scoreA}-${s.scoreB}` : `${s.scoreA}-${s.scoreB}`;
    });
}

export function calculateSetBasedStandings(category) {
  const table = {};
  (category?.teams || []).forEach((t) => {
    if (isPlaceholderTeam(t.name)) return;
    table[t.id] = {
      id: t.id,
      name: t.name,
      logoUrl: t.logoUrl || null,
      players: t.players || [],
      played: 0,
      won: 0,
      lost: 0,
      points: 0,
      setsFor: 0,
      setsAgainst: 0,
      setDiff: 0,
    };
  });

  (category?.rounds || []).forEach((round) => {
    (round.matches || []).forEach((match) => {
      if (match.status !== "COMPLETED") return;
      const a = table[match.teamAId];
      const b = table[match.teamBId];
      if (!a || !b) return;
      a.played += 1;
      b.played += 1;
      a.setsFor += match.scoreA || 0;
      a.setsAgainst += match.scoreB || 0;
      b.setsFor += match.scoreB || 0;
      b.setsAgainst += match.scoreA || 0;
      if (match.scoreA > match.scoreB) {
        a.won += 1;
        b.lost += 1;
        a.points += 3;
      } else if (match.scoreB > match.scoreA) {
        b.won += 1;
        a.lost += 1;
        b.points += 3;
      }
    });
  });

  return Object.values(table)
    .map((row) => ({
      ...row,
      setDiff: row.setsFor - row.setsAgainst,
    }))
    .sort(
      (x, y) =>
        y.points - x.points ||
        y.won - x.won ||
        y.setDiff - x.setDiff ||
        y.setsFor - x.setsFor ||
        x.name.localeCompare(y.name)
    );
}
