/** Legal balls → overs display string e.g. 18.3 */
export function ballsToOvers(legalBalls) {
  const balls = Math.max(0, Number(legalBalls) || 0);
  const overs = Math.floor(balls / 6);
  const rem = balls % 6;
  return `${overs}.${rem}`;
}

export function oversToMaxBalls(oversLimit) {
  return (Number(oversLimit) || 0) * 6;
}

export function isLegalExtra(extraType) {
  // Wide and no-ball do not count as a legal ball
  return extraType !== "WD" && extraType !== "NB";
}

export function computeRunsTotal({ runsOffBat = 0, extras = 0, extraType = null }) {
  const bat = Math.max(0, Number(runsOffBat) || 0);
  const ex = Math.max(0, Number(extras) || 0);
  if (extraType === "WD" || extraType === "NB") {
    // WD/NB: at least 1 extra + any additional runs (off bat for NB, or runs for WD)
    return Math.max(1, ex) + bat;
  }
  if (extraType === "BYE" || extraType === "LB") {
    return ex + bat;
  }
  return bat + ex;
}

/** Total run value that rotates strike (odd = swap) — includes byes/leg-byes */
export function strikeRotationRuns({ runsOffBat = 0, extras = 0, extraType = null, isWicket = false }) {
  if (isWicket) return 0; // new batsman comes in; caller sets striker
  if (extraType === "WD") {
    // Runs taken on a wide rotate (excluding the wide itself which is +1)
    const taken = Math.max(0, (Number(extras) || 1) - 1) + (Number(runsOffBat) || 0);
    return taken;
  }
  if (extraType === "NB") {
    return Number(runsOffBat) || 0; // runs off the bat on NB rotate; the +1 NB does not
  }
  if (extraType === "BYE" || extraType === "LB") {
    return Number(extras) || 0;
  }
  return Number(runsOffBat) || 0;
}

export function shouldSwapStrike(rotationRuns, overJustCompleted) {
  let swap = (rotationRuns % 2) === 1;
  if (overJustCompleted) swap = !swap;
  return swap;
}

export function inningsTotals(match, battingTeamId) {
  const isA = battingTeamId === match.teamAId;
  return {
    runs: isA ? match.scoreA : match.scoreB,
    wickets: isA ? match.wicketsA : match.wicketsB,
    legalBalls: isA ? match.ballsFacedA : match.ballsFacedB,
  };
}

export function formatInningsScore(match, teamId) {
  const { runs, wickets, legalBalls } = inningsTotals(match, teamId);
  return `${runs}/${wickets} (${ballsToOvers(legalBalls)})`;
}

export function isInningsComplete(match, battingTeamId) {
  const { wickets, legalBalls } = inningsTotals(match, battingTeamId);
  const maxBalls = oversToMaxBalls(match.oversLimit);
  if (wickets >= 10) return true;
  if (maxBalls > 0 && legalBalls >= maxBalls) return true;
  return false;
}

export function chaseTarget(match) {
  // Team that batted first accumulated scoreA or scoreB
  if (!match.inningsComplete || match.inningsComplete < 1) return null;
  const firstBattingWasA =
    match.battingTeamId === match.teamBId
      ? true // currently batting B ⇒ A batted first (or after innings flip)
      : match.battingTeamId === match.teamAId
        ? false
        : null;

  // Prefer stored first-innings total via inningsComplete + scores:
  // After first innings ends we start 2nd — battingTeamId is chasing side.
  // First innings runs = the other team's score.
  if (match.currentInnings === 2 && match.battingTeamId) {
    const firstRuns =
      match.battingTeamId === match.teamAId ? match.scoreB : match.scoreA;
    return firstRuns + 1;
  }

  // Fallback unused
  void firstBattingWasA;
  return null;
}

export function ballsRemaining(match, battingTeamId) {
  const { legalBalls } = inningsTotals(match, battingTeamId);
  return Math.max(0, oversToMaxBalls(match.oversLimit) - legalBalls);
}

export function matchResultSummary(match) {
  if (match.status !== "COMPLETED") return null;
  const a = match.scoreA;
  const b = match.scoreB;
  if (a === b) return "Match tied";
  if (a > b) {
    // If A chased (batting second), win by wickets; else by runs
    const aChased = match.inningsComplete >= 1 && match.battingTeamId === match.teamAId;
    if (aChased || match.currentInnings === 2) {
      const wicketsLeft = Math.max(0, 10 - (match.wicketsA || 0));
      return `won by ${wicketsLeft} wicket${wicketsLeft === 1 ? "" : "s"}`;
    }
    return `won by ${a - b} run${a - b === 1 ? "" : "s"}`;
  }
  const bChased = match.battingTeamId === match.teamBId;
  if (bChased || match.currentInnings === 2) {
    const wicketsLeft = Math.max(0, 10 - (match.wicketsB || 0));
    return `won by ${wicketsLeft} wicket${wicketsLeft === 1 ? "" : "s"}`;
  }
  return `won by ${b - a} run${b - a === 1 ? "" : "s"}`;
}

/**
 * Recompute match cricket aggregates from a list of balls (ordered).
 * Also derives current striker/non-striker/bowler/innings if possible.
 */
export function recomputeFromBalls(match, balls) {
  let scoreA = 0;
  let scoreB = 0;
  let wicketsA = 0;
  let wicketsB = 0;
  let ballsFacedA = 0;
  let ballsFacedB = 0;

  for (const ball of balls) {
    const isA = ball.battingTeamId === match.teamAId;
    if (isA) {
      scoreA += ball.runsTotal || 0;
      if (ball.isWicket) wicketsA += 1;
      if (ball.isLegal) ballsFacedA += 1;
    } else {
      scoreB += ball.runsTotal || 0;
      if (ball.isWicket) wicketsB += 1;
      if (ball.isLegal) ballsFacedB += 1;
    }
  }

  return { scoreA, scoreB, wicketsA, wicketsB, ballsFacedA, ballsFacedB };
}

export function nextBallPosition(legalBallsInInnings) {
  const overNumber = Math.floor(legalBallsInInnings / 6);
  const ballInOver = (legalBallsInInnings % 6) + 1; // 1–6
  return { overNumber, ballInOver };
}

export function calculateCricketStandings(category) {
  const table = {};
  (category?.teams || []).forEach((t) => {
    table[t.id] = {
      id: t.id,
      name: t.name,
      logoUrl: t.logoUrl || null,
      played: 0,
      won: 0,
      lost: 0,
      tied: 0,
      points: 0,
      runsFor: 0,
      runsAgainst: 0,
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
      a.runsFor += match.scoreA || 0;
      a.runsAgainst += match.scoreB || 0;
      b.runsFor += match.scoreB || 0;
      b.runsAgainst += match.scoreA || 0;
      if (match.scoreA === match.scoreB) {
        a.tied += 1;
        b.tied += 1;
        a.points += 1;
        b.points += 1;
      } else if (match.scoreA > match.scoreB) {
        a.won += 1;
        b.lost += 1;
        a.points += 2;
      } else {
        b.won += 1;
        a.lost += 1;
        b.points += 2;
      }
    });
  });

  return Object.values(table).sort(
    (x, y) =>
      y.points - x.points ||
      y.won - x.won ||
      y.runsFor - x.runsFor ||
      x.name.localeCompare(y.name)
  );
}

export function calculateCricketLeaders(category) {
  const runs = {};
  const wickets = {};

  const allPlayers = {};
  (category?.teams || []).forEach((t) => {
    (t.players || []).forEach((p) => {
      allPlayers[p.id] = { ...p, teamName: t.name, teamLogoUrl: t.logoUrl || null };
    });
  });

  (category?.rounds || []).forEach((round) => {
    (round.matches || []).forEach((match) => {
      (match.cricketBalls || []).forEach((ball) => {
        if (ball.strikerId && (ball.runsOffBat || 0) > 0) {
          if (!runs[ball.strikerId]) {
            const p = allPlayers[ball.strikerId];
            runs[ball.strikerId] = {
              id: ball.strikerId,
              name: p?.name || "Unknown",
              shirtNumber: p?.shirtNumber,
              logoUrl: p?.logoUrl || null,
              teamName: p?.teamName || "Unknown",
              teamLogoUrl: p?.teamLogoUrl || null,
              runs: 0,
            };
          }
          runs[ball.strikerId].runs += ball.runsOffBat || 0;
        }
        if (ball.isWicket && ball.bowlerId && ball.dismissalType !== "RUN_OUT") {
          if (!wickets[ball.bowlerId]) {
            const p = allPlayers[ball.bowlerId];
            wickets[ball.bowlerId] = {
              id: ball.bowlerId,
              name: p?.name || "Unknown",
              shirtNumber: p?.shirtNumber,
              logoUrl: p?.logoUrl || null,
              teamName: p?.teamName || "Unknown",
              teamLogoUrl: p?.teamLogoUrl || null,
              wickets: 0,
            };
          }
          wickets[ball.bowlerId].wickets += 1;
        }
      });
    });
  });

  return {
    runScorers: Object.values(runs).sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name)),
    wicketTakers: Object.values(wickets).sort(
      (a, b) => b.wickets - a.wickets || a.name.localeCompare(b.name)
    ),
  };
}
