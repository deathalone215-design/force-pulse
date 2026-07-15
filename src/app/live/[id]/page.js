"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Trophy,
  Loader2,
  ShieldAlert,
  Award,
  Calendar,
  Activity,
  Users,
  ArrowLeft,
  Radio,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { isTopScorerGoal } from "@/lib/matchEvents";
import { hasTournamentDayStarted, formatTournamentDate } from "@/lib/tournamentDate";
import {
  ballsToOvers,
  calculateCricketLeaders,
  calculateCricketStandings,
  inningsTotals,
} from "@/lib/cricket";

function withTeamLogo(team, category) {
  if (!team) return team;
  if (team.logoUrl) return team;
  const fromCat = (category?.teams || []).find((t) => t.id === team.id);
  if (fromCat?.logoUrl) return { ...team, logoUrl: fromCat.logoUrl };
  return team;
}

const isPlaceholderTeam = (name) => {
  if (!name) return false;
  const norm = name.toLowerCase().trim();
  return (
    norm.includes("tbd") ||
    [
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
    ].some((p) => norm.includes(p))
  );
};

const getRoundName = (number, totalRounds) => {
  if (totalRounds === 4) {
    if (number === 1) return "Saturday League";
    if (number === 2) return "Sunday League";
    if (number === 3) return "Semi-Finals";
    if (number === 4) return "Final";
  }
  return `Round ${number}`;
};

const getTeamGradient = (name) => {
  if (!name) return "linear-gradient(135deg, #0d472c, #093c24)";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const c1 = Math.abs(hash) % 360;
  const c2 = (c1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${c1}, 60%, 45%), hsl(${c2}, 60%, 30%))`;
};

function calculateStandings(category) {
  if (!category) return [];

  const standings = (category.teams || [])
    .filter((team) => !isPlaceholderTeam(team.name))
    .map((team) => ({
      id: team.id,
      name: team.name,
      logoUrl: team.logoUrl,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      pts: 0,
    }));

  (category.rounds || []).forEach((round) => {
    (round.matches || []).forEach((match) => {
      // Points table updates only when a match is marked COMPLETED
      if (match.status !== "COMPLETED") return;
      const homeIndex = standings.findIndex((t) => t.id === match.teamAId);
      const awayIndex = standings.findIndex((t) => t.id === match.teamBId);
      if (homeIndex === -1 || awayIndex === -1) return;

      const h = standings[homeIndex];
      const a = standings[awayIndex];
      h.played += 1;
      a.played += 1;
      h.gf += match.scoreA;
      h.ga += match.scoreB;
      a.gf += match.scoreB;
      a.ga += match.scoreA;

      if (match.scoreA > match.scoreB) {
        h.won += 1;
        h.pts += 3;
        a.lost += 1;
      } else if (match.scoreA < match.scoreB) {
        a.won += 1;
        a.pts += 3;
        h.lost += 1;
      } else {
        h.drawn += 1;
        h.pts += 1;
        a.drawn += 1;
        a.pts += 1;
      }
      h.gd = h.gf - h.ga;
      a.gd = a.gf - a.ga;
    });
  });

  return standings.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name);
  });
}

function calculateTopScorers(category) {
  if (!category) return [];
  const scorers = {};

  (category.rounds || []).forEach((round) => {
    (round.matches || []).forEach((match) => {
      (match.events || []).forEach((event) => {
        // Own goals update the scoreboard but never count for top scorers
        if (!isTopScorerGoal(event.type) || !event.playerId || !event.player) return;
        const pId = event.playerId;
        if (!scorers[pId]) {
          const team = (category.teams || []).find((t) => t.id === event.player.teamId);
          scorers[pId] = {
            id: pId,
            name: event.player.name,
            shirtNumber: event.player.shirtNumber,
            logoUrl: event.player.logoUrl || null,
            teamName: team?.name || "Unknown",
            teamLogoUrl: team?.logoUrl || null,
            goals: 0,
          };
        }
        scorers[pId].goals += 1;
      });
    });
  });

  return Object.values(scorers).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
}

function TeamBadge({ team, size = "md" }) {
  const [imgFailed, setImgFailed] = useState(false);
  const sizes = {
    sm: "w-8 h-8 text-[9px]",
    md: "w-11 h-11 text-xs",
    lg: "w-14 h-14 text-sm",
    xl: "w-16 h-16 sm:w-20 sm:h-20 text-sm sm:text-base",
  };
  const cls = sizes[size] || sizes.md;

  if (team?.logoUrl && !imgFailed) {
    return (
      <img
        src={team.logoUrl}
        alt={team.name || "Team"}
        onError={() => setImgFailed(true)}
        className={`${cls} rounded-full object-cover border-2 border-white shadow-md bg-white shrink-0`}
      />
    );
  }
  return (
    <div
      style={{ background: getTeamGradient(team?.name) }}
      className={`${cls} rounded-full flex items-center justify-center font-bold text-white uppercase select-none shadow-md border-2 border-white shrink-0`}
    >
      {(team?.name || "??").slice(0, 2)}
    </div>
  );
}

function CricketScoreBlock({ match, teamId, compact }) {
  const tot = inningsTotals(match, teamId);
  const hasBatted =
    tot.legalBalls > 0 ||
    tot.runs > 0 ||
    tot.wickets > 0 ||
    match.battingTeamId === teamId ||
    match.status === "COMPLETED";
  if (!hasBatted && match.status === "SCHEDULED") {
    return (
      <span className="font-mono text-[10px] text-slate-400 uppercase">Yet to bat</span>
    );
  }
  if (!hasBatted && match.status === "LIVE" && match.battingTeamId !== teamId) {
    return (
      <span className="font-mono text-[10px] text-slate-400 uppercase">Yet to bat</span>
    );
  }
  return (
    <div className="text-center">
      <span
        className={`font-mono font-bold text-white bg-[#0a331f] rounded-xl shadow border border-black inline-block ${
          compact
            ? "text-base px-2 py-1.5"
            : "text-xl sm:text-2xl px-3 py-2"
        }`}
      >
        {tot.runs}/{tot.wickets}
      </span>
      <p className="text-[9px] font-mono text-deep-forest/50 mt-1">
        ({ballsToOvers(tot.legalBalls)}
        {match.oversLimit ? `/${match.oversLimit}` : ""})
      </p>
    </div>
  );
}

function MatchCard({
  match,
  compact = false,
  categoryName = null,
  category = null,
  isCricket = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const isLive = match.status === "LIVE";
  const isCompleted = match.status === "COMPLETED";

  const teamA = withTeamLogo(match.teamA, category);
  const teamB = withTeamLogo(match.teamB, category);
  const teamAPlayers = teamA?.players || match.teamA?.players || [];
  const teamBPlayers = teamB?.players || match.teamB?.players || [];
  const badgeSize = isLive && !compact ? "xl" : compact ? "sm" : "md";

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className={`w-full text-left bg-white rounded-2xl border-2 p-4 sm:p-5 transition-all cursor-pointer ${
        isLive
          ? "border-red-400 shadow-md ring-2 ring-red-100"
          : "border-dashed border-mustard-gold/70 hover:border-solid"
      } ${expanded ? "ring-2 ring-mustard-gold/40" : ""}`}
    >
      <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
        <span
          className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded border tracking-wider shrink-0 ${
            isLive
              ? "bg-red-50 border-red-200 text-red-700 animate-pulse"
              : isCompleted
                ? "bg-slate-100 border-slate-200 text-slate-500"
                : "bg-slate-50 border-slate-200/60 text-slate-400"
          }`}
        >
          {isLive ? "● LIVE" : match.status}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
          {isCricket && match.oversLimit ? (
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-deep-forest/60 bg-cream-bg border border-slate-200 rounded-md px-2 py-0.5">
              {match.oversLimit} ov
            </span>
          ) : null}
          {categoryName ? (
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-mustard-gold-hover bg-mustard-gold/15 border border-mustard-gold/40 rounded-md px-2 py-0.5">
              {categoryName}
            </span>
          ) : null}
          <span className="text-[9px] font-mono text-deep-forest/40 uppercase tracking-wider hidden sm:inline">
            {expanded ? "Hide squad" : "Tap for players"}
          </span>
        </div>
      </div>

      {!expanded ? (
        isCricket ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
            <div className="flex flex-col items-center gap-2 min-w-0">
              <TeamBadge team={teamA} size={badgeSize} />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide line-clamp-2 leading-tight">
                {teamA?.name}
              </span>
              <CricketScoreBlock match={match} teamId={match.teamAId} compact={compact} />
            </div>
            <span className="text-slate-300 font-mono text-xs font-bold">vs</span>
            <div className="flex flex-col items-center gap-2 min-w-0">
              <TeamBadge team={teamB} size={badgeSize} />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide line-clamp-2 leading-tight">
                {teamB?.name}
              </span>
              <CricketScoreBlock match={match} teamId={match.teamBId} compact={compact} />
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-3 items-center gap-2 text-center">
          <div className="flex flex-col items-center gap-2 min-w-0">
            <TeamBadge team={teamA} size={badgeSize} />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide line-clamp-2 leading-tight">
              {teamA?.name}
            </span>
          </div>

            <div className="flex items-center justify-center gap-1.5 sm:gap-2">
              <span
                className={`font-mono font-bold text-white bg-[#0a331f] rounded-xl shadow border border-black ${
                  compact ? "text-lg px-2.5 py-1.5 min-w-[34px]" : "text-2xl sm:text-3xl px-3.5 py-2 min-w-[44px]"
                }`}
              >
                {match.scoreA}
              </span>
              <span className="text-slate-400 font-bold font-mono">:</span>
              <span
                className={`font-mono font-bold text-white bg-[#0a331f] rounded-xl shadow border border-black ${
                  compact ? "text-lg px-2.5 py-1.5 min-w-[34px]" : "text-2xl sm:text-3xl px-3.5 py-2 min-w-[44px]"
                }`}
              >
                {match.scoreB}
              </span>
            </div>

          <div className="flex flex-col items-center gap-2 min-w-0">
            <TeamBadge team={teamB} size={badgeSize} />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide line-clamp-2 leading-tight">
              {teamB?.name}
            </span>
          </div>
        </div>
        )
      ) : (
        <div className="space-y-4 animate-fadeIn">
          {isCricket ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-[9px] font-mono uppercase text-deep-forest/45 mb-1">
                  {teamA?.name}
                </p>
                <CricketScoreBlock match={match} teamId={match.teamAId} />
              </div>
              <div className="text-center">
                <p className="text-[9px] font-mono uppercase text-deep-forest/45 mb-1">
                  {teamB?.name}
                </p>
                <CricketScoreBlock match={match} teamId={match.teamBId} />
              </div>
            </div>
          ) : (
          <div className="flex items-center justify-center gap-3">
            <span className="font-mono font-bold text-white bg-[#0a331f] rounded-xl shadow border border-black text-3xl px-4 py-2.5 min-w-[52px] text-center">
              {match.scoreA}
            </span>
            <span className="text-slate-400 font-bold font-mono text-xl">:</span>
            <span className="font-mono font-bold text-white bg-[#0a331f] rounded-xl shadow border border-black text-3xl px-4 py-2.5 min-w-[52px] text-center">
              {match.scoreB}
            </span>
          </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { team: teamA, players: teamAPlayers, side: "Home" },
              { team: teamB, players: teamBPlayers, side: "Away" },
            ].map(({ team, players, side }) => (
              <div
                key={side}
                className="bg-cream-bg border border-slate-200 rounded-xl p-3 space-y-3"
              >
                <div className="flex items-center gap-3 border-b border-slate-200/80 pb-2.5">
                  <TeamBadge team={team} size="lg" />
                  <div className="min-w-0">
                    <p className="text-[9px] font-mono uppercase tracking-widest text-deep-forest/45 font-bold">
                      {side}
                    </p>
                    <p className="text-sm font-display uppercase tracking-wide text-deep-forest leading-tight break-words">
                      {team?.name || "TBD"}
                    </p>
                  </div>
                </div>

                {players.length === 0 ? (
                  <p className="text-[10px] font-mono text-deep-forest/40 py-2">
                    No players registered
                  </p>
                ) : (
                  <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {[...players]
                      .sort((a, b) => (a.shirtNumber || 0) - (b.shirtNumber || 0))
                      .map((player) => (
                        <li
                          key={player.id}
                          className="flex items-center gap-2 text-xs bg-white border border-slate-200/70 rounded-lg px-2.5 py-1.5"
                        >
                          {player.logoUrl ? (
                            <img
                              src={player.logoUrl}
                              alt=""
                              className="w-7 h-7 shrink-0 rounded-full object-cover border border-mustard-gold/50"
                            />
                          ) : (
                            <span className="w-6 h-6 shrink-0 flex items-center justify-center bg-[#0a331f] text-white text-[9px] font-mono font-bold rounded">
                              {player.shirtNumber ?? "–"}
                            </span>
                          )}
                          <span className="font-sans font-semibold text-deep-forest truncate flex-1 min-w-0">
                            {player.name}
                          </span>
                          {player.logoUrl && (
                            <span className="text-[9px] font-mono font-bold text-deep-forest/50 shrink-0">
                              #{player.shirtNumber ?? "–"}
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                )}
                <p className="text-[9px] font-mono text-deep-forest/40 uppercase tracking-wider pt-1">
                  {players.length} player{players.length === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </button>
  );
}

export default function PublicLiveBoard() {
  const { id } = useParams();
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [section, setSection] = useState("live"); // live, schedule, table, scorers
  const prevLiveCountRef = useRef(0);
  const prevCompletedIdsRef = useRef(null);
  const userPickedCategoryRef = useRef(false);
  const categoryStorageKey = id ? `md_active_category_${id}` : null;

  const selectCategory = (catId) => {
    userPickedCategoryRef.current = true;
    setActiveCategoryId(catId);
    if (categoryStorageKey && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(categoryStorageKey, catId);
      } catch {
        /* ignore */
      }
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Tournament not found");
      const data = await res.json();
      setTournament(data);

      const liveInAny = [];
      const completedIds = [];
      for (const cat of data.categories || []) {
        for (const round of cat.rounds || []) {
          for (const match of round.matches || []) {
            if (match.status === "LIVE") {
              liveInAny.push({ match, categoryId: cat.id });
            }
            if (match.status === "COMPLETED") {
              completedIds.push(match.id);
            }
          }
        }
      }

      const liveCount = liveInAny.length;

      // Only jump to Live Scores when a match newly becomes LIVE (0 → 1+)
      if (liveCount > 0 && prevLiveCountRef.current === 0) {
        setSection("live");
      }
      prevLiveCountRef.current = liveCount;

      // When a match is newly marked COMPLETED, show Points Table (points just locked in)
      if (prevCompletedIdsRef.current !== null) {
        const prev = new Set(prevCompletedIdsRef.current);
        const newlyCompleted = completedIds.filter((mid) => !prev.has(mid));
        if (newlyCompleted.length > 0) {
          setSection("table");
          outer: for (const cat of data.categories || []) {
            for (const round of cat.rounds || []) {
              for (const match of round.matches || []) {
                if (newlyCompleted.includes(match.id)) {
                  setActiveCategoryId(cat.id);
                  break outer;
                }
              }
            }
          }
        }
      }
      prevCompletedIdsRef.current = completedIds;

      setActiveCategoryId((prev) => {
        let stored = null;
        if (typeof window !== "undefined" && categoryStorageKey) {
          try {
            stored = window.localStorage.getItem(categoryStorageKey);
          } catch {
            stored = null;
          }
        }
        if (prev && data.categories?.some((c) => c.id === prev)) return prev;
        if (stored && data.categories?.some((c) => c.id === stored)) {
          userPickedCategoryRef.current = true;
          return stored;
        }
        if (
          !userPickedCategoryRef.current &&
          liveInAny.length > 0
        ) {
          return liveInAny[0].categoryId;
        }
        return data.categories?.[0]?.id || null;
      });

      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, categoryStorageKey]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 3000);
    return () => clearInterval(timer);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-cream-bg gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-mustard-gold" />
        <p className="text-xs font-mono text-deep-forest/50 uppercase tracking-widest">
          Loading live board...
        </p>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-cream-bg px-4 text-center gap-4">
        <ShieldAlert className="w-12 h-12 text-red-600" />
        <h2 className="text-lg font-bold font-mono uppercase">Board unavailable</h2>
        <p className="text-sm text-deep-forest/60 font-mono">{error || "Tournament not found"}</p>
        <Link
          href="/"
          className="px-5 py-2.5 bg-mustard-gold text-deep-forest rounded-xl text-xs font-mono font-bold uppercase"
        >
          Back home
        </Link>
      </div>
    );
  }

  // Board unlocks on tournament day (e.g. Jul 18). Live matches appear when admin sets LIVE.
  if (!hasTournamentDayStarted(tournament)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-cream-bg px-4 text-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-white border-2 border-dashed border-mustard-gold flex items-center justify-center">
          <Clock className="w-8 h-8 text-mustard-gold" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-xl font-display uppercase text-deep-forest tracking-wide">
            {tournament.name}
          </h2>
          <p className="text-xs font-mono text-deep-forest/55 leading-relaxed">
            The live board opens on{" "}
            <span className="font-bold text-deep-forest">
              {formatTournamentDate(tournament.startDate)}
            </span>
            . On that day, matches appear under Live when an admin sets them to
            LIVE.
          </p>
        </div>
        <Link
          href="/"
          className="px-5 py-2.5 bg-mustard-gold text-deep-forest rounded-xl text-xs font-mono font-bold uppercase"
        >
          Back home
        </Link>
      </div>
    );
  }

  const activeCategory =
    tournament.categories?.find((c) => c.id === activeCategoryId) ||
    tournament.categories?.[0];
  const rounds = activeCategory?.rounds || [];
  const allMatches = rounds.flatMap((r) =>
    (r.matches || []).map((m) => ({ ...m, roundNumber: r.number, totalRounds: rounds.length }))
  );

  // Live scores: every LIVE match across all categories (banner / alerts)
  const allLiveMatches = (tournament.categories || []).flatMap((cat) =>
    (cat.rounds || []).flatMap((r) =>
      (r.matches || [])
        .filter((m) => m.status === "LIVE")
        .map((m) => ({
          ...m,
          categoryName: cat.name,
          categoryId: cat.id,
          roundNumber: r.number,
          totalRounds: (cat.rounds || []).length,
        }))
    )
  );

  // Upcoming + completed (and category live list) follow the selected category
  const categoryLiveMatches = allMatches
    .filter((m) => m.status === "LIVE")
    .map((m) => ({ ...m, categoryName: activeCategory?.name }));
  const categoryCompletedMatches = allMatches
    .filter((m) => m.status === "COMPLETED")
    .map((m) => ({ ...m, categoryName: activeCategory?.name }));

  const isCricket = tournament.sport === "CRICKET";
  const footballStandings = calculateStandings(activeCategory);
  const cricketStandings = calculateCricketStandings(activeCategory).filter(
    (t) => !isPlaceholderTeam(t.name)
  );
  const standings = isCricket ? cricketStandings : footballStandings;
  const topScorers = calculateTopScorers(activeCategory);
  const cricketLeaders = isCricket
    ? calculateCricketLeaders(activeCategory)
    : { runScorers: [], wicketTakers: [] };

  const sections = [
    {
      id: "live",
      label: "Matches",
      icon: Radio,
      count: categoryLiveMatches.length + categoryCompletedMatches.length,
    },
    { id: "schedule", label: "Schedule", icon: Calendar, count: allMatches.length },
    { id: "table", label: "Points Table", icon: Trophy, count: standings.length },
    {
      id: "scorers",
      label: isCricket ? "Leaders" : "Top Scorers",
      icon: Award,
      count: isCricket
        ? cricketLeaders.runScorers.length + cricketLeaders.wicketTakers.length
        : topScorers.length,
    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-cream-bg text-deep-forest font-sans overflow-x-hidden">
      <header className="pitch-stripes border-b-4 border-mustard-gold/80 shadow-md relative overflow-hidden py-8">
        <div className="absolute inset-0 bg-black/15 pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Link
                href="/"
                className="p-2.5 border border-white/20 hover:border-white/40 bg-[#093c24]/80 text-white rounded-xl transition-all shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              {tournament.logoUrl ? (
                <img
                  src={tournament.logoUrl}
                  alt={tournament.name}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-mustard-gold shadow-md shrink-0 bg-white"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#093c24] border-2 border-mustard-gold/60 flex items-center justify-center shrink-0">
                  <Trophy className="w-7 h-7 sm:w-8 sm:h-8 text-mustard-gold" />
                </div>
              )}
              <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 text-mustard-gold font-mono text-[10px] font-bold uppercase tracking-widest mb-1 flex-wrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    Public Live Board
                  </span>
                  {updatedAt && (
                    <>
                      <span className="text-white/40 hidden sm:inline">•</span>
                      <span className="text-white/60 normal-case tracking-normal w-full sm:w-auto">
                        Updated {updatedAt.toLocaleTimeString()}
                      </span>
                    </>
                  )}
                </div>
                <h1 className="text-xl sm:text-3xl md:text-4xl font-display uppercase text-white drop-shadow tracking-wide truncate">
                  {tournament.name}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-mono text-white/75">
                  <span className="inline-flex items-center gap-1 bg-white/10 border border-white/15 rounded-lg px-2 py-0.5 font-bold uppercase tracking-wider">
                    {isCricket
                      ? `Cricket · ${tournament.oversPerInnings || "?"} ov`
                      : "Football"}
                  </span>
                  {tournament.startDate && (
                    <span className="inline-flex items-center gap-1 bg-white/10 border border-white/15 rounded-lg px-2 py-0.5">
                      <Calendar className="w-3 h-3 text-mustard-gold" />
                      {formatTournamentDate(tournament.startDate)}
                    </span>
                  )}
                  {activeCategory && (
                    <span className="inline-flex items-center gap-1 bg-mustard-gold/20 border border-mustard-gold/40 text-mustard-gold rounded-lg px-2 py-0.5 font-bold uppercase tracking-wider">
                      {activeCategory.name}
                    </span>
                  )}
                  {categoryLiveMatches.length > 0 && (
                    <span className="inline-flex items-center gap-1 bg-red-500/90 text-white rounded-lg px-2 py-0.5 font-bold uppercase tracking-wider animate-pulse">
                      {categoryLiveMatches.length} live
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {(tournament.categories || []).length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/15">
              <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-mustard-gold/80 mb-2.5">
                Categories
              </p>
              <div className="flex flex-wrap gap-2">
                {(tournament.categories || []).map((cat) => {
                  const active = cat.id === activeCategory?.id;
                  const clubs = (cat.teams || []).filter((t) => !isPlaceholderTeam(t.name)).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        selectCategory(cat.id);
                      }}
                      className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider border transition-all cursor-pointer min-h-[44px] ${
                        active
                          ? "bg-mustard-gold text-deep-forest border-mustard-gold shadow-sm"
                          : "bg-white/10 text-white border-white/20 hover:bg-white/15"
                      }`}
                    >
                      {cat.name}
                      <span className={`ml-1.5 ${active ? "opacity-70" : "opacity-50"}`}>
                        ({clubs})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </header>

      {allLiveMatches.length > 0 && (
        <div className="bg-red-600 text-white py-2.5 text-center">
          <div className="max-w-6xl mx-auto px-4 flex items-center justify-center gap-2 text-xs font-mono font-bold tracking-wider">
            <Activity className="w-4 h-4 animate-pulse" />
            {allLiveMatches.length} MATCH{allLiveMatches.length > 1 ? "ES" : ""} LIVE NOW
          </div>
        </div>
      )}

      <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 overflow-x-auto tab-scroll flex gap-2 py-3">
          {sections.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={`flex items-center gap-2 py-2.5 px-3.5 sm:px-4 rounded-xl font-mono text-[10px] uppercase tracking-wider cursor-pointer whitespace-nowrap transition-all border min-h-[44px] ${
                  active
                    ? "bg-mustard-gold text-deep-forest border-mustard-gold font-bold"
                    : "bg-cream-bg text-deep-forest/70 border-transparent hover:border-mustard-gold/40"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {s.label}
                {s.count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? "bg-deep-forest/10" : "bg-white border border-slate-200"}`}>
                    {s.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 sm:py-8 space-y-8 sm:space-y-10">
        {section === "live" && (
          <section className="space-y-10 animate-fadeIn">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
                Match Centre — {activeCategory?.name}
              </h2>
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-0.5">
                Auto-refresh 3s
              </span>
            </div>

            {/* LIVE (selected category) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-red-200 pb-2">
                <Activity className="w-4 h-4 text-red-600" />
                <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-red-700">
                  Live Matches
                </h3>
                <span className="text-[9px] font-mono font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                  {categoryLiveMatches.length}
                </span>
              </div>

              {categoryLiveMatches.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl py-8 px-6 text-center">
                  <Radio className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-mono text-deep-forest/50">
                    No live matches in {activeCategory?.name || "this category"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {categoryLiveMatches.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      categoryName={m.categoryName || activeCategory?.name}
                      category={activeCategory}
                      isCricket={isCricket}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* COMPLETED (selected category) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/70">
                  Completed Matches
                </h3>
                <span className="text-[9px] font-mono font-bold text-deep-forest/60 bg-cream-bg border border-slate-200 rounded-full px-2 py-0.5">
                  {categoryCompletedMatches.length}
                </span>
              </div>

              {categoryCompletedMatches.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl py-8 px-6 text-center">
                  <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-mono text-deep-forest/50">
                    No completed matches in {activeCategory?.name || "this category"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...categoryCompletedMatches].reverse().map((m) => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      compact
                      categoryName={m.categoryName || activeCategory?.name}
                      category={activeCategory}
                      isCricket={isCricket}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {section === "schedule" && (
          <section className="space-y-8 animate-fadeIn">
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
              Full Schedule — {activeCategory?.name}
            </h2>

            {rounds.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl py-16 text-center">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-xs font-mono text-deep-forest/50">No fixtures scheduled yet</p>
              </div>
            ) : (
              rounds.map((round) => (
                <div key={round.id} className="space-y-4">
                  <div className="flex items-center gap-3 border-b border-slate-200 pb-2">
                    <span className="text-xl font-display uppercase tracking-wider">
                      {getRoundName(round.number, rounds.length)}
                    </span>
                    <span className="text-[9px] font-mono font-bold uppercase bg-white border border-dashed border-mustard-gold rounded-full px-3 py-1">
                      {round.matches.length} matches
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {round.matches.map((m) => (
                      <MatchCard
                        key={m.id}
                        match={m}
                        compact
                        categoryName={activeCategory?.name}
                        category={activeCategory}
                        isCricket={isCricket}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {section === "table" && (
          <section className="space-y-6 animate-fadeIn">
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
              Points Table — {activeCategory?.name}
            </h2>
            <p className="text-[10px] font-mono text-deep-forest/45 -mt-4">
              {isCricket
                ? "Win 2 pts · Tie 1 pt · Updates when a match is completed"
                : "Updates when a match is marked completed"}
            </p>

            {standings.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl py-16 text-center">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-xs font-mono text-deep-forest/50">No standings yet</p>
                <p className="text-[10px] font-mono text-deep-forest/35 mt-2">
                  Finish a live match to add points
                </p>
              </div>
            ) : (
              <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl overflow-hidden shadow-sm">
                <p className="sm:hidden text-[9px] font-mono text-deep-forest/40 px-4 pt-3">
                  Swipe sideways for full table →
                </p>
                <div className="overflow-x-auto tab-scroll">
                  <table className="w-full text-left border-collapse text-xs font-mono min-w-[520px]">
                    <thead>
                      <tr className="bg-[#082e1c] text-[10px] text-white uppercase font-bold">
                        <th className="py-3 px-4 w-12 text-center">#</th>
                        <th className="py-3 px-4">Team</th>
                        <th className="py-3 px-2 text-center w-12">P</th>
                        <th className="py-3 px-2 text-center w-12">W</th>
                        <th className="py-3 px-2 text-center w-12">
                          {isCricket ? "T" : "D"}
                        </th>
                        <th className="py-3 px-2 text-center w-12">L</th>
                        {!isCricket && (
                          <th className="py-3 px-2 text-center w-12">GD</th>
                        )}
                        {isCricket && (
                          <th className="py-3 px-2 text-center w-14">RF</th>
                        )}
                        <th className="py-3 px-4 text-center w-16 bg-[#062416] text-mustard-gold border-l border-[#0a331f]">
                          Pts
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#faf6ee]">
                      {standings.map((t, idx) => (
                        <tr key={t.id} className="bg-[#fcf7ed] hover:bg-amber-50/50">
                          <td className="py-3 px-4 text-center font-bold">{idx + 1}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <TeamBadge team={t} size="sm" />
                              <span className="font-sans font-bold uppercase tracking-wide truncate max-w-[180px]">
                                {t.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center">{t.played}</td>
                          <td className="py-3 px-2 text-center">{t.won}</td>
                          <td className="py-3 px-2 text-center">
                            {isCricket ? t.tied : t.drawn}
                          </td>
                          <td className="py-3 px-2 text-center">{t.lost}</td>
                          {!isCricket && (
                            <td
                              className={`py-3 px-2 text-center font-bold ${
                                t.gd > 0 ? "text-emerald-700" : t.gd < 0 ? "text-red-500" : ""
                              }`}
                            >
                              {t.gd > 0 ? `+${t.gd}` : t.gd}
                            </td>
                          )}
                          {isCricket && (
                            <td className="py-3 px-2 text-center">{t.runsFor}</td>
                          )}
                          <td className="py-3 px-4 text-center font-bold bg-[#062416]/10 text-sm border-l border-[#093c24]/20">
                            {isCricket ? t.points : t.pts}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {section === "scorers" && isCricket && (
          <section className="space-y-8 animate-fadeIn">
            <div>
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
                Top run-scorers — {activeCategory?.name}
              </h2>
              {cricketLeaders.runScorers.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl py-12 text-center mt-4">
                  <p className="text-xs font-mono text-deep-forest/50">No runs recorded yet</p>
                </div>
              ) : (
                <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl overflow-hidden shadow-sm mt-4">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="bg-[#082e1c] text-[10px] text-white uppercase font-bold">
                        <th className="py-3 px-4 w-12">#</th>
                        <th className="py-3 px-4">Player</th>
                        <th className="py-3 px-4">Club</th>
                        <th className="py-3 px-4 text-center">Runs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#faf6ee]">
                      {cricketLeaders.runScorers.slice(0, 20).map((p, idx) => (
                        <tr key={p.id} className="bg-[#fcf7ed]">
                          <td className="py-3 px-4 font-bold">{idx + 1}</td>
                          <td className="py-3 px-4 font-sans font-bold flex items-center gap-2">
                            {p.logoUrl ? (
                              <img src={p.logoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                            ) : null}
                            {p.name}
                          </td>
                          <td className="py-3 px-4 uppercase">{p.teamName}</td>
                          <td className="py-3 px-4 text-center font-bold">{p.runs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
                Top wicket-takers — {activeCategory?.name}
              </h2>
              {cricketLeaders.wicketTakers.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl py-12 text-center mt-4">
                  <p className="text-xs font-mono text-deep-forest/50">No wickets recorded yet</p>
                </div>
              ) : (
                <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl overflow-hidden shadow-sm mt-4">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="bg-[#082e1c] text-[10px] text-white uppercase font-bold">
                        <th className="py-3 px-4 w-12">#</th>
                        <th className="py-3 px-4">Player</th>
                        <th className="py-3 px-4">Club</th>
                        <th className="py-3 px-4 text-center">Wkts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#faf6ee]">
                      {cricketLeaders.wicketTakers.slice(0, 20).map((p, idx) => (
                        <tr key={p.id} className="bg-[#fcf7ed]">
                          <td className="py-3 px-4 font-bold">{idx + 1}</td>
                          <td className="py-3 px-4 font-sans font-bold">{p.name}</td>
                          <td className="py-3 px-4 uppercase">{p.teamName}</td>
                          <td className="py-3 px-4 text-center font-bold">{p.wickets}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {section === "scorers" && !isCricket && (
          <section className="space-y-6 animate-fadeIn">
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
              Top Scorers — {activeCategory?.name}
            </h2>
            <p className="text-[10px] font-mono text-deep-forest/45 -mt-4">
              Own goals are not counted
            </p>

            {topScorers.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl py-16 text-center">
                <Award className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-xs font-mono text-deep-forest/50">No goals recorded yet</p>
              </div>
            ) : (
              <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl overflow-hidden shadow-sm max-w-3xl">
                <p className="sm:hidden text-[9px] font-mono text-deep-forest/40 px-4 pt-3">
                  Swipe sideways for full table →
                </p>
                <div className="overflow-x-auto tab-scroll">
                  <table className="w-full text-left border-collapse text-xs font-mono min-w-[420px]">
                    <thead>
                      <tr className="bg-[#082e1c] text-[10px] text-white uppercase font-bold">
                        <th className="py-3 px-4 w-16 text-center">Rank</th>
                        <th className="py-3 px-4">Player</th>
                        <th className="py-3 px-4">Club</th>
                        <th className="py-3 px-4 text-center w-24 bg-[#062416] border-l border-[#0a331f]">
                          Goals
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#faf6ee]">
                      {topScorers.map((p, idx) => (
                        <tr key={p.id} className="bg-[#fcf7ed] hover:bg-amber-50/50">
                          <td className="py-3 px-4 text-center font-bold">
                            {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 font-sans font-bold">
                              {p.logoUrl ? (
                                <img
                                  src={p.logoUrl}
                                  alt=""
                                  className="w-7 h-7 rounded-full object-cover border border-mustard-gold/50 shrink-0"
                                />
                              ) : (
                                <span className="w-6 h-6 flex items-center justify-center bg-white border border-slate-200 text-[8px] rounded font-mono shrink-0">
                                  {p.shirtNumber}
                                </span>
                              )}
                              {p.name}
                            </div>
                          </td>
                          <td className="py-3 px-4 uppercase tracking-wide font-sans text-slate-600">
                            <div className="flex items-center gap-2 min-w-0">
                              <TeamBadge
                                team={{ name: p.teamName, logoUrl: p.teamLogoUrl }}
                                size="sm"
                              />
                              <span className="truncate">{p.teamName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center font-bold bg-[#062416]/10 border-l border-[#093c24]/20 text-sm">
                            {p.goals}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-[10px] font-mono text-slate-400 tracking-wider">
        Auto-refreshes every 3s · Spectators view only
      </footer>
    </div>
  );
}
