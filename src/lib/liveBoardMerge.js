/** Merge delta matches into an existing live-board tournament object (client-safe). */
export function applyLiveBoardDelta(tournament, deltaMatches) {
  if (!tournament || !deltaMatches?.length) return tournament;

  const byId = new Map(deltaMatches.map((m) => [m.id, m]));

  return {
    ...tournament,
    categories: (tournament.categories || []).map((cat) => ({
      ...cat,
      rounds: (cat.rounds || []).map((round) => ({
        ...round,
        matches: (round.matches || []).map((m) => {
          const patch = byId.get(m.id);
          if (!patch) return m;
          const {
            categoryId: _c,
            roundId: _r,
            roundNumber: _n,
            ...fields
          } = patch;
          return {
            ...m,
            ...fields,
            teamA: fields.teamA
              ? {
                  ...fields.teamA,
                  players: fields.teamA.players || m.teamA?.players,
                }
              : m.teamA,
            teamB: fields.teamB
              ? {
                  ...fields.teamB,
                  players: fields.teamB.players || m.teamB?.players,
                }
              : m.teamB,
            events: fields.events ?? m.events,
            cricketBalls: fields.cricketBalls ?? m.cricketBalls,
            matchSets: fields.matchSets ?? m.matchSets,
          };
        }),
      })),
    })),
  };
}
