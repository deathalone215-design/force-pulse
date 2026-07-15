const PLACEHOLDER_NAMES = [
  "1st placed team",
  "2nd placed team",
  "3rd placed team",
  "4th placed team",
  "winner sf1",
  "winner sf2",
  "winner first",
  "winner second",
  "w1",
  "w2",
];

export function isPlaceholderTeam(name) {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  return n.includes("tbd") || PLACEHOLDER_NAMES.some((p) => n.includes(p));
}

export function resolveTournamentPlaceholders(category) {
  // Works on a category-shaped object: { teams, rounds }
  if (!category || !category.teams || !category.rounds) return category;

  const isPlaceholder = isPlaceholderTeam;

  const realMatches = [];
  category.rounds.forEach(round => {
    round.matches.forEach(match => {
      if (match.teamA && match.teamB && !isPlaceholder(match.teamA.name) && !isPlaceholder(match.teamB.name)) {
        realMatches.push(match);
      }
    });
  });

  const isLeagueCompleted = realMatches.length === 0 || realMatches.every(m => m.status === "COMPLETED");

  const realTeams = category.teams.filter(t => !isPlaceholder(t.name));
  const standings = realTeams.map(t => ({
    id: t.id,
    name: t.name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    pts: 0,
    teamObj: t
  }));

  category.rounds.forEach(round => {
    round.matches.forEach(match => {
      // Standings (and placing for SF placeholders) use COMPLETED matches only
      if (match.status === "COMPLETED") {
        const homeIndex = standings.findIndex(t => t.id === match.teamAId);
        const awayIndex = standings.findIndex(t => t.id === match.teamBId);
        if (homeIndex !== -1 && awayIndex !== -1) {
          const h = standings[homeIndex];
          const a = standings[awayIndex];
          h.played++;
          a.played++;
          h.gf += match.scoreA;
          h.ga += match.scoreB;
          a.gf += match.scoreB;
          a.ga += match.scoreA;

          if (match.scoreA > match.scoreB) {
            h.won++;
            h.pts += 3;
            a.lost++;
          } else if (match.scoreA < match.scoreB) {
            a.won++;
            a.pts += 3;
            h.lost++;
          } else {
            h.drawn++;
            h.pts += 1;
            a.drawn++;
            a.pts += 1;
          }
          h.gd = h.gf - h.ga;
          a.gd = a.gf - a.ga;
        }
      }
    });
  });

  standings.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name);
  });

  const mapping = {};
  const placeholderTeams = category.teams.filter(t => isPlaceholder(t.name));

  if (isLeagueCompleted) {
    placeholderTeams.forEach(t => {
      const nameLower = t.name.toLowerCase().trim();
      let resolved = null;
      if (nameLower.includes("1st")) {
        resolved = standings[0]?.teamObj;
      } else if (nameLower.includes("2nd")) {
        resolved = standings[1]?.teamObj;
      } else if (nameLower.includes("3rd")) {
        resolved = standings[2]?.teamObj;
      } else if (nameLower.includes("4th")) {
        resolved = standings[3]?.teamObj;
      }
      if (resolved) {
        mapping[t.id] = resolved;
      }
    });
  } else {
    placeholderTeams.forEach(t => {
      const nameLower = t.name.toLowerCase().trim();
      if (nameLower.includes("1st")) {
        t.name = "TBD (1st Place)";
      } else if (nameLower.includes("2nd")) {
        t.name = "TBD (2nd Place)";
      } else if (nameLower.includes("3rd")) {
        t.name = "TBD (3rd Place)";
      } else if (nameLower.includes("4th")) {
        t.name = "TBD (4th Place)";
      }
    });
  }

  const getResolvedTeam = (team) => {
    if (!team) return team;
    if (mapping[team.id]) {
      return mapping[team.id];
    }
    const placeholderInTeams = placeholderTeams.find(t => t.id === team.id);
    if (placeholderInTeams) {
      return placeholderInTeams;
    }
    return team;
  };

  category.rounds.forEach(round => {
    round.matches.forEach(match => {
      const resolvedA = getResolvedTeam(match.teamA);
      const resolvedB = getResolvedTeam(match.teamB);
      match.teamA = resolvedA;
      match.teamB = resolvedB;
      match.teamAId = resolvedA.id;
      match.teamBId = resolvedB.id;
    });
  });

  const round3 = category.rounds.find(r => r.number === 3);
  if (round3 && round3.matches.length >= 2) {
    const sf1Match = round3.matches[0];
    const sf2Match = round3.matches[1];

    const sf1Completed = sf1Match && sf1Match.status === "COMPLETED";
    const sf2Completed = sf2Match && sf2Match.status === "COMPLETED";

    const getWinner = (m) => {
      if (m.status !== "COMPLETED") return null;
      if (m.scoreA > m.scoreB) return m.teamA;
      if (m.scoreB > m.scoreA) return m.teamB;
      return null;
    };

    const sf1Winner = getWinner(sf1Match);
    const sf2Winner = getWinner(sf2Match);

    placeholderTeams.forEach(t => {
      const nameLower = t.name.toLowerCase();
      if (nameLower.includes("winner sf1") || nameLower.includes("w1") || nameLower.includes("winner first")) {
        if (sf1Completed && sf1Winner) {
          mapping[t.id] = sf1Winner;
        } else {
          t.name = "TBD (Winner SF1)";
        }
      } else if (nameLower.includes("winner sf2") || nameLower.includes("w2") || nameLower.includes("winner second")) {
        if (sf2Completed && sf2Winner) {
          mapping[t.id] = sf2Winner;
        } else {
          t.name = "TBD (Winner SF2)";
        }
      }
    });

    category.rounds.forEach(round => {
      round.matches.forEach(match => {
        const resolvedA = getResolvedTeam(match.teamA);
        const resolvedB = getResolvedTeam(match.teamB);
        match.teamA = resolvedA;
        match.teamB = resolvedB;
        match.teamAId = resolvedA.id;
        match.teamBId = resolvedB.id;
      });
    });
  }

  return category;
}
