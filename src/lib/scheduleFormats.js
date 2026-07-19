/** Schedule format generators for Force Pulse categories. */

export const SCHEDULE_FORMATS = ["ROUND_ROBIN", "LEAGUE", "KNOCKOUT", "SWISS"];

export function normalizeScheduleFormat(value) {
  const s = String(value || "ROUND_ROBIN").toUpperCase().trim();
  return SCHEDULE_FORMATS.includes(s) ? s : "ROUND_ROBIN";
}

export function scheduleFormatLabel(format) {
  switch (normalizeScheduleFormat(format)) {
    case "LEAGUE":
      return "League";
    case "KNOCKOUT":
      return "Knockout";
    case "SWISS":
      return "Swiss";
    default:
      return "Round Robin";
  }
}

export function scheduleFormatHelp(format) {
  switch (normalizeScheduleFormat(format)) {
    case "LEAGUE":
      return "Same as round robin for weekend events: every club plays every other club once.";
    case "KNOCKOUT":
      return "Single-elimination bracket. Byes are assigned when the club count is not a power of 2. Later rounds use Winner placeholders.";
    case "SWISS":
      return "Pairs Round 1 now. After a round is fully completed, generate the next Swiss round from current standings.";
    default:
      return "Everyone plays everyone once. Odd club counts get automatic byes (no match that week).";
  }
}

/** Winner R1M2 style knockout placeholders */
export function isKnockoutWinnerPlaceholder(name) {
  if (!name) return false;
  return /^winner\s*r\d+\s*m\d+$/i.test(String(name).trim());
}

export function parseKnockoutWinnerName(name) {
  const m = String(name || "")
    .trim()
    .match(/^winner\s*r(\d+)\s*m(\d+)$/i);
  if (!m) return null;
  return { round: parseInt(m[1], 10), match: parseInt(m[2], 10) };
}

export function knockoutWinnerName(roundNumber, matchIndex) {
  return `Winner R${roundNumber}M${matchIndex}`;
}

/**
 * Circle method single round-robin.
 * @param {{id:string,name?:string}[]} teams
 * @returns {{number:number,matches:{teamAId:string,teamBId:string}[]}[]}
 */
export function generateRoundRobin(teams) {
  const real = (teams || []).filter((t) => t?.id);
  if (real.length < 2) {
    throw new Error("You need at least 2 teams to generate a schedule.");
  }

  const list = [...real];
  if (list.length % 2 !== 0) {
    list.push({ id: null, name: "BYE" });
  }
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
    rounds.push({ number: rIndex + 1, matches: roundMatches });
    list.splice(1, 0, list.pop());
  }

  return rounds;
}

/** League uses the same single round-robin as Round Robin for short events. */
export function generateLeague(teams) {
  return generateRoundRobin(teams);
}

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Single-elimination bracket.
 * Matches may use teamAId/teamBId or teamAName/teamBName for Winner placeholders.
 * @param {{id:string,name?:string}[]} teams
 */
export function generateKnockout(teams) {
  const real = (teams || []).filter((t) => t?.id);
  if (real.length < 2) {
    throw new Error("You need at least 2 teams for a knockout bracket.");
  }

  const n = real.length;
  const size = nextPowerOfTwo(n);
  const byeCount = size - n;

  // First `byeCount` teams receive byes into round 2 (or final bracket round 1 if no play-in)
  const byeTeams = real.slice(0, byeCount).map((t) => ({ kind: "team", id: t.id }));
  const playing = real.slice(byeCount);

  const rounds = [];
  /** @type {{kind:'team'|'placeholder', id?:string, name?:string}[]} */
  let advancing = [];

  let roundNumber = 1;

  if (playing.length > 0) {
    const matches = [];
    for (let i = 0; i < playing.length; i += 2) {
      const a = playing[i];
      const b = playing[i + 1];
      if (!a || !b) {
        throw new Error("Knockout seeding error: unpaired team in round 1.");
      }
      const matchIndex = matches.length + 1;
      matches.push({
        teamAId: a.id,
        teamBId: b.id,
      });
      advancing.push({
        kind: "placeholder",
        name: knockoutWinnerName(roundNumber, matchIndex),
      });
    }
    rounds.push({ number: roundNumber, matches });
    roundNumber += 1;
  }

  advancing = [...byeTeams, ...advancing];

  // If everyone had a bye somehow (shouldn't), pad from real list
  while (advancing.length < 2 && real.length >= 2) {
    advancing = real.map((t) => ({ kind: "team", id: t.id }));
  }

  while (advancing.length > 1) {
    const matches = [];
    const next = [];
    for (let i = 0; i < advancing.length; i += 2) {
      const a = advancing[i];
      const b = advancing[i + 1];
      if (!b) {
        // Odd slot — should not happen with power-of-2 bracket
        next.push(a);
        continue;
      }

      // Both real teams with bye into same "virtual" first round: create match
      if (a.kind === "team" && b.kind === "team") {
        const matchIndex = matches.length + 1;
        matches.push({ teamAId: a.id, teamBId: b.id });
        next.push({
          kind: "placeholder",
          name: knockoutWinnerName(roundNumber, matchIndex),
        });
        continue;
      }

      const matchIndex = matches.length + 1;
      const match = {};
      if (a.kind === "team") match.teamAId = a.id;
      else match.teamAName = a.name;
      if (b.kind === "team") match.teamBId = b.id;
      else match.teamBName = b.name;
      matches.push(match);
      next.push({
        kind: "placeholder",
        name: knockoutWinnerName(roundNumber, matchIndex),
      });
    }

    if (matches.length > 0) {
      rounds.push({ number: roundNumber, matches });
      roundNumber += 1;
    }
    advancing = next;
  }

  return rounds;
}

function buildStandingsFromMatches(teams, completedMatches) {
  const standings = teams.map((t) => ({
    id: t.id,
    name: t.name || "",
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    pts: 0,
  }));

  const byId = new Map(standings.map((s) => [s.id, s]));

  for (const match of completedMatches || []) {
    if (match.status && match.status !== "COMPLETED") continue;
    const a = byId.get(match.teamAId);
    const b = byId.get(match.teamBId);
    if (!a || !b) continue;

    const scoreA = match.scoreA ?? 0;
    const scoreB = match.scoreB ?? 0;
    a.played += 1;
    b.played += 1;
    a.gf += scoreA;
    a.ga += scoreB;
    b.gf += scoreB;
    b.ga += scoreA;

    if (scoreA > scoreB) {
      a.won += 1;
      a.pts += 3;
      b.lost += 1;
    } else if (scoreB > scoreA) {
      b.won += 1;
      b.pts += 3;
      a.lost += 1;
    } else {
      a.drawn += 1;
      b.drawn += 1;
      a.pts += 1;
      b.pts += 1;
    }
    a.gd = a.gf - a.ga;
    b.gd = b.gf - b.ga;
  }

  standings.sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (y.gd !== x.gd) return y.gd - x.gd;
    if (y.gf !== x.gf) return y.gf - x.gf;
    return x.name.localeCompare(y.name);
  });

  return standings;
}

function havePlayed(teamAId, teamBId, allMatches) {
  return (allMatches || []).some(
    (m) =>
      (m.teamAId === teamAId && m.teamBId === teamBId) ||
      (m.teamAId === teamBId && m.teamBId === teamAId)
  );
}

/**
 * One Swiss round: pair by standings, avoid rematches when possible.
 * @returns {{number:number,matches:{teamAId:string,teamBId:string}[]}}
 */
export function generateSwissRound(teams, completedMatches, roundNumber, allMatches) {
  const real = (teams || []).filter((t) => t?.id);
  if (real.length < 2) {
    throw new Error("You need at least 2 teams for Swiss pairing.");
  }

  const standings = buildStandingsFromMatches(real, completedMatches);
  const ordered = standings.map((s) => real.find((t) => t.id === s.id)).filter(Boolean);
  const history = allMatches || completedMatches || [];

  const unpaired = [...ordered];
  const matches = [];

  while (unpaired.length >= 2) {
    const a = unpaired.shift();
    let partnerIndex = unpaired.findIndex((b) => !havePlayed(a.id, b.id, history));
    if (partnerIndex === -1) partnerIndex = 0;
    const b = unpaired.splice(partnerIndex, 1)[0];
    matches.push({ teamAId: a.id, teamBId: b.id });
  }
  // Odd team sits out (bye) — no match row

  return {
    number: roundNumber,
    matches,
  };
}

/** Suggested Swiss round count ≈ log2(n). */
export function suggestedSwissRounds(teamCount) {
  const n = Math.max(2, teamCount || 2);
  return Math.max(3, Math.ceil(Math.log2(n)));
}

/**
 * Round display names for dashboard / live board.
 * Pass `customName` when the round has a saved label.
 */
export function getRoundDisplayName(number, totalRounds, format, customName) {
  const custom = customName != null ? String(customName).trim() : "";
  if (custom) return custom;

  const fmt = normalizeScheduleFormat(format);
  const n = number || 1;
  const total = totalRounds || 1;

  if (fmt === "SWISS") return `Swiss Round ${n}`;

  if (fmt === "KNOCKOUT") {
    const teamsInRound = 2 ** (total - n + 1);
    if (teamsInRound <= 2) return "Final";
    if (teamsInRound === 4) return "Semi-Finals";
    if (teamsInRound === 8) return "Quarter-Finals";
    if (teamsInRound === 16) return "Round of 16";
    if (teamsInRound === 32) return "Round of 32";
    return `Round of ${teamsInRound}`;
  }

  if (fmt === "LEAGUE" || fmt === "ROUND_ROBIN") {
    return `Matchday ${n}`;
  }

  // Legacy hybrid seed (4 rounds)
  if (total === 4) {
    if (n === 1) return "Saturday League";
    if (n === 2) return "Sunday League";
    if (n === 3) return "Semi-Finals";
    if (n === 4) return "Final";
  }

  return `Round ${n}`;
}

/**
 * Build rounds for a format (replace mode). Swiss returns Round 1 only.
 */
export function generateScheduleRounds(format, teams) {
  const fmt = normalizeScheduleFormat(format);
  if (fmt === "KNOCKOUT") return generateKnockout(teams);
  if (fmt === "SWISS") {
    const round = generateSwissRound(teams, [], 1, []);
    return [round];
  }
  if (fmt === "LEAGUE") return generateLeague(teams);
  return generateRoundRobin(teams);
}
