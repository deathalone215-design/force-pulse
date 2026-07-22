"use client";

import { useState, useEffect, useCallback, useRef, Children, useMemo } from "react";
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
import { hasTournamentDayStarted, formatTournamentDate, formatScheduledAt } from "@/lib/tournamentDate";
import {
  ballsToOvers,
  calculateCricketLeaders,
  calculateCricketStandings,
  inningsTotals,
  computeBatterStats,
  computeBowlerStats,
  computeCurrentRunRate,
  computeRequiredRunRate,
  computeProjectedScore,
  computePartnership,
  getCurrentOverBalls,
  getLastNOversRuns,
  ballDisplayLabel,
  ballDisplayColor,
  oversToMaxBalls,
  ballsRemaining,
} from "@/lib/cricket";
import {
  isSetBasedSport,
  calculateSetBasedStandings,
  SPORT_CONFIGS,
  getConfig,
  getSetTarget,
} from "@/lib/setBasedSports";
import {
  categoryDisplayName,
  isSinglesCategory,
  isDoublesOrMixedCategory,
} from "@/lib/sports";
import { resolveTeamLogo } from "@/lib/teamLogo";
import { isPlaceholderTeam, buildFootballStandings } from "@/lib/tournamentResolver";
import { getRoundDisplayName } from "@/lib/scheduleFormats";
import { applyLiveBoardDelta, mergeLiveBoardSnapshot } from "@/lib/liveBoardMerge";
import { useMatchRealtime } from "@/hooks/useMatchRealtime";
import { hasSupabaseRealtimeEnv } from "@/lib/supabaseBrowser";
import {
  formatFootballClock,
  footballElapsedSeconds,
  footballDisplayMinute,
  footballClockOpts,
  isFootballClockPaused,
  formatEventMinute,
  footballPeriodShort,
  footballLiveMinuteLabel,
  FOOTBALL_PERIODS,
  normalizeFootballPeriod,
  completedFootballClockLabel,
} from "@/lib/footballClock";

const getRoundName = (number, totalRounds, format, customName) =>
  getRoundDisplayName(number, totalRounds, format, customName);

function withTeamLogo(team, category) {
  if (!team) return team;
  const logo = resolveTeamLogo(team, category);
  if (logo) return { ...team, logoUrl: logo };
  return team;
}

const getTeamGradient = (name) => {
  if (!name) return "linear-gradient(135deg, #0d472c, #093c24)";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const c1 = Math.abs(hash) % 360;
  const c2 = (c1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${c1}, 60%, 45%), hsl(${c2}, 60%, 30%))`;
};

function calculateStandings(category) {
  return buildFootballStandings(category).map(
    ({ teamObj: _t, ...row }) => row
  );
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
  const logoUrl = team?.logoUrl || null;

  useEffect(() => {
    setImgFailed(false);
  }, [logoUrl]);

  const sizes = {
    sm: "w-8 h-8 text-[9px]",
    md: "w-11 h-11 text-xs",
    lg: "w-14 h-14 text-sm",
    xl: "w-16 h-16 sm:w-20 sm:h-20 text-sm sm:text-base",
  };
  const cls = sizes[size] || sizes.md;

  if (logoUrl && !imgFailed) {
    return (
      <img
        src={logoUrl}
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

const CONFETTI_COLORS = ["#e5a93b", "#ef4444", "#ffffff", "#3b82f6", "#22c55e", "#f97316"];
// Precomputed so SSR/CSR render identical markup (no Math.random in render).
const CONFETTI_PIECES = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 137 + 29) % 100,
  delay: (i % 7) * 0.5,
  duration: 3.4 + (i % 5) * 0.6,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  size: 6 + (i % 3) * 3,
}));
const FIREWORKS = [
  { left: "8%", top: "12%", delay: "0s", color: "#e5a93b" },
  { left: "80%", top: "8%", delay: "0.6s", color: "#ef4444" },
  { left: "68%", top: "52%", delay: "1.2s", color: "#ffffff" },
  { left: "18%", top: "58%", delay: "1.8s", color: "#e5a93b" },
  { left: "45%", top: "20%", delay: "2.2s", color: "#22c55e" },
];

function ChampionCelebration({ category, rounds, standings, isCricket, isSetBased }) {
  const matches = (rounds || []).flatMap((r) => r.matches || []);
  if (matches.length === 0) return null;
  if (!matches.every((m) => m.status === "COMPLETED")) return null;

  const sortedRounds = [...rounds].sort((a, b) => a.number - b.number);
  const lastRound = sortedRounds[sortedRounds.length - 1];
  const lastRoundMatches = lastRound?.matches || [];
  const finalMatch = lastRoundMatches[lastRoundMatches.length - 1] || null;
  const isKnockoutFinal = lastRoundMatches.length === 1;

  const setsWon = (match, teamId) =>
    (match.matchSets || []).filter((s) => s.winnerId === teamId).length;

  const finalScores = (match) => {
    if (!match) return { a: 0, b: 0 };
    if (isSetBased) {
      return { a: setsWon(match, match.teamAId), b: setsWon(match, match.teamBId) };
    }
    return { a: match.scoreA || 0, b: match.scoreB || 0 };
  };

  // Champion: winner of the final when the last round is a single match,
  // otherwise (league / round robin) top of the points table.
  let winner = null;
  let runnerUp = null;
  if (finalMatch && isKnockoutFinal) {
    let { a, b } = finalScores(finalMatch);
    if (a === b && !isSetBased && !isCricket) {
      a = finalMatch.penaltyScoreA || 0;
      b = finalMatch.penaltyScoreB || 0;
    }
    if (a > b) {
      winner = finalMatch.teamA;
      runnerUp = finalMatch.teamB;
    } else if (b > a) {
      winner = finalMatch.teamB;
      runnerUp = finalMatch.teamA;
    }
  }
  if (!winner || isPlaceholderTeam(winner.name)) {
    winner = standings[0] || null;
    runnerUp = standings[1] || null;
  }
  if (!winner || isPlaceholderTeam(winner.name)) return null;

  const winnerTeam = withTeamLogo(winner.teamObj || winner, category);
  const runnerUpTeam = runnerUp
    ? withTeamLogo(runnerUp.teamObj || runnerUp, category)
    : null;

  const { a: finalA, b: finalB } = finalScores(finalMatch);
  const hasPens =
    !isCricket &&
    !isSetBased &&
    finalMatch &&
    ((finalMatch.penaltyScoreA || 0) > 0 || (finalMatch.penaltyScoreB || 0) > 0);

  const roundLabel = lastRound
    ? getRoundName(
        lastRound.number,
        sortedRounds.length,
        category?.scheduleFormat,
        lastRound.name
      )
    : "Final";

  return (
    <section className="relative overflow-hidden rounded-2xl border-2 border-mustard-gold bg-[#0a331f] text-white p-6 sm:p-10 shadow-lg animate-fadeIn">
      {FIREWORKS.map((f, i) => (
        <span
          key={`fw-${i}`}
          className="fp-firework"
          style={{
            left: f.left,
            top: f.top,
            animationDelay: f.delay,
            background: `radial-gradient(circle, ${f.color} 0%, transparent 62%)`,
          }}
        />
      ))}
      {CONFETTI_PIECES.map((c, i) => (
        <span
          key={`cf-${i}`}
          className="fp-confetti"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.size * 1.8,
            background: c.color,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
          }}
        />
      ))}

      <div className="relative z-10 flex flex-col items-center text-center gap-3 sm:gap-4">
        <div className="inline-flex items-center gap-2 text-mustard-gold font-mono text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em]">
          <span className="w-1.5 h-1.5 rounded-full bg-mustard-gold" />
          Tournament complete — {categoryDisplayName(category)}
          <span className="w-1.5 h-1.5 rounded-full bg-mustard-gold" />
        </div>

        <div className="fp-champion-trophy">
          <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-mustard-gold drop-shadow-[0_0_18px_rgba(229,169,59,0.55)]" />
        </div>

        <div className="flex flex-col items-center gap-2.5">
          <TeamBadge team={winnerTeam} size="xl" />
          <p className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-mustard-gold">
            Champions
          </p>
          <h2 className="text-3xl sm:text-5xl font-display uppercase tracking-wide drop-shadow">
            {winnerTeam?.name}
          </h2>
          {runnerUpTeam && !isPlaceholderTeam(runnerUpTeam.name) && (
            <p className="text-[10px] sm:text-xs font-mono text-white/60 uppercase tracking-widest">
              Runners-up — {runnerUpTeam.name}
            </p>
          )}
        </div>

        {finalMatch && finalMatch.teamA && finalMatch.teamB && (
          <div className="mt-2 w-full max-w-md bg-white/10 border border-mustard-gold/40 rounded-2xl px-4 py-3.5 backdrop-blur-sm">
            <p className="text-[9px] font-mono font-bold uppercase tracking-[0.25em] text-mustard-gold mb-2.5">
              {isKnockoutFinal ? roundLabel : "Last match"}
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <TeamBadge team={withTeamLogo(finalMatch.teamA, category)} size="sm" />
                <span className="text-xs sm:text-sm font-bold uppercase truncate">
                  {finalMatch.teamA.name}
                </span>
              </div>
              <div className="shrink-0 font-mono font-bold text-lg sm:text-xl bg-[#0d472c] border border-mustard-gold/50 rounded-xl px-3 py-1.5">
                {isCricket
                  ? `${finalMatch.scoreA || 0}/${finalMatch.wicketsA || 0} · ${finalMatch.scoreB || 0}/${finalMatch.wicketsB || 0}`
                  : `${finalA} : ${finalB}`}
              </div>
              <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                <span className="text-xs sm:text-sm font-bold uppercase truncate text-right">
                  {finalMatch.teamB.name}
                </span>
                <TeamBadge team={withTeamLogo(finalMatch.teamB, category)} size="sm" />
              </div>
            </div>
            {hasPens && (
              <p className="text-[9px] font-mono text-white/60 mt-2">
                Penalties {finalMatch.penaltyScoreA || 0} – {finalMatch.penaltyScoreB || 0}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function CricketScoreBlock({ match, teamId, compact }) {
  const tot = inningsTotals(match, teamId);
  const hasBatted = tot.legalBalls > 0 || tot.runs > 0 || tot.wickets > 0 || match.battingTeamId === teamId || match.status === "COMPLETED";
  if (!hasBatted && match.status === "SCHEDULED") return <span className="font-mono text-[10px] text-slate-400 uppercase">Yet to bat</span>;
  if (!hasBatted && match.status === "LIVE" && match.battingTeamId !== teamId) return <span className="font-mono text-[10px] text-slate-400 uppercase">Yet to bat</span>;
  return (
    <div className="text-center">
      <span className={`font-mono font-bold text-white bg-[#0a331f] rounded-xl shadow border border-black inline-block ${compact ? "text-base px-2 py-1.5" : "text-xl sm:text-2xl px-3 py-2"}`}>
        {tot.runs}/{tot.wickets}
      </span>
      <p className="text-[9px] font-mono text-deep-forest/50 mt-1">({ballsToOvers(tot.legalBalls)}{match.oversLimit ? `/${match.oversLimit}` : ""})</p>
    </div>
  );
}

function BallDot({ ball, size = "md" }) {
  const label = ballDisplayLabel(ball);
  const color = ballDisplayColor(ball);
  const sizeClass =
    size === "lg"
      ? "w-9 h-9 text-[11px]"
      : "w-8 h-8 text-[10px]";
  return (
    <span
      className={`inline-flex items-center justify-center ${sizeClass} rounded-full border font-mono font-bold leading-none ${color}`}
    >
      {label}
    </span>
  );
}

function CricketLiveCard({ match, category }) {
  const allBalls = match.cricketBalls || [];
  const oversLimit = match.oversLimit || 20;
  const batting = match.battingTeamId;
  const rosterA = category?.teams?.find((t) => t.id === match.teamAId);
  const rosterB = category?.teams?.find((t) => t.id === match.teamBId);
  const allPlayers = [
    ...(rosterA?.players || match.teamA?.players || []),
    ...(rosterB?.players || match.teamB?.players || []),
  ];

  const findPlayer = (id) => allPlayers.find((p) => p.id === id);
  const battingTeam = batting === match.teamAId ? match.teamA : match.teamB;
  const bowlingTeam = batting === match.teamAId ? match.teamB : match.teamA;

  const inningsBalls = allBalls.filter((b) => b.innings === match.currentInnings);
  const tot = batting ? inningsTotals(match, batting) : null;

  const firstInningsTeam = allBalls.find((b) => b.innings === 1)?.battingTeamId;
  const firstInningsScore =
    firstInningsTeam === match.teamAId ? match.scoreA : match.scoreB;
  const firstInningsWkts =
    firstInningsTeam === match.teamAId ? match.wicketsA : match.wicketsB;
  const firstInningsBalls =
    firstInningsTeam === match.teamAId ? match.ballsFacedA : match.ballsFacedB;

  const target =
    match.currentInnings === 2 && batting
      ? (batting === match.teamAId ? match.scoreB : match.scoreA) + 1
      : null;
  const runsNeeded =
    target != null && tot ? Math.max(0, target - tot.runs) : null;
  const ballsLeft = tot ? ballsRemaining(match, batting) : 0;

  const crr = tot ? computeCurrentRunRate(tot.runs, tot.legalBalls) : "0.00";
  const rrr =
    runsNeeded != null ? computeRequiredRunRate(runsNeeded, ballsLeft) : null;
  const projected =
    match.currentInnings === 1 && tot
      ? computeProjectedScore(
          tot.runs,
          tot.legalBalls,
          oversToMaxBalls(oversLimit)
        )
      : null;

  const strikerStats = match.strikerId
    ? computeBatterStats(inningsBalls, match.strikerId)
    : null;
  const nonStrikerStats = match.nonStrikerId
    ? computeBatterStats(inningsBalls, match.nonStrikerId)
    : null;
  const bowlerStats = match.bowlerId
    ? computeBowlerStats(inningsBalls, match.bowlerId)
    : null;
  const partnership =
    match.strikerId && match.nonStrikerId
      ? computePartnership(
          allBalls,
          match.strikerId,
          match.nonStrikerId,
          match.currentInnings
        )
      : null;

  const currentOverBalls = tot
    ? getCurrentOverBalls(allBalls, match.currentInnings, tot.legalBalls)
    : [];
  const lastOvers = getLastNOversRuns(allBalls, match.currentInnings, 5);
  const overRuns = currentOverBalls.reduce((s, b) => s + (b.runsTotal || 0), 0);

  const strikerPlayer = findPlayer(match.strikerId);
  const nonStrikerPlayer = findPlayer(match.nonStrikerId);
  const bowlerPlayer = findPlayer(match.bowlerId);

  const isLive = match.status === "LIVE";
  const isCompleted = match.status === "COMPLETED";
  const oversNow = ballsToOvers(tot?.legalBalls ?? 0);

  if (isCompleted) {
    return (
      <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
        <div className="bg-[#0a331f] px-3 py-2 flex items-center justify-between">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-mustard-gold">
            Result
          </span>
          <span className="text-[9px] font-mono text-white/50 uppercase">
            {oversLimit} ov
          </span>
        </div>
        <div className="divide-y divide-slate-100">
          {[
            {
              team: match.teamA,
              runs: match.scoreA,
              wkts: match.wicketsA,
              balls: match.ballsFacedA,
            },
            {
              team: match.teamB,
              runs: match.scoreB,
              wkts: match.wicketsB,
              balls: match.ballsFacedB,
            },
          ].map(
            ({ team, runs, wkts, balls }) =>
              team && (
                <div
                  key={team.id}
                  className="flex items-center justify-between px-3.5 py-3 gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {team.logoUrl ? (
                      <img
                        src={team.logoUrl}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-[#0d472c] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {(team.name || "??").slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <p className="text-sm font-semibold text-deep-forest truncate">
                      {team.name}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-mono font-bold text-deep-forest tabular-nums">
                      {runs}
                      <span className="text-deep-forest/40">/{wkts}</span>
                    </p>
                    <p className="text-[10px] font-mono text-slate-400">
                      ({ballsToOvers(balls)} ov)
                    </p>
                  </div>
                </div>
              )
          )}
        </div>
        {(match.manOfTheMatch || match.bestFielder) && (
          <div className="border-t border-slate-100 px-3.5 py-3 space-y-1.5 bg-cream-bg/40">
            {match.manOfTheMatch && (
              <p className="text-[10px] font-mono text-deep-forest">
                <span className="text-deep-forest/45 uppercase tracking-wider font-bold">Man of the Match</span>
                {" · "}
                <span className="font-bold text-mustard-gold">{match.manOfTheMatch.name}</span>
              </p>
            )}
            {match.bestFielder && (
              <p className="text-[10px] font-mono text-deep-forest">
                <span className="text-deep-forest/45 uppercase tracking-wider font-bold">Best Fielder</span>
                {" · "}
                <span className="font-bold text-mustard-gold">{match.bestFielder.name}</span>
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-[#0d472c]/25 bg-white shadow-md">
      {/* Header strip — Cricbuzz style */}
      <div className="bg-gradient-to-r from-[#0a331f] via-[#0d472c] to-[#0a331f] px-3.5 py-3 text-white">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-red-600 text-white px-2 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                Live
              </span>
            )}
            <span className="text-[9px] font-mono text-white/55 uppercase tracking-wider">
              Inn {match.currentInnings}
              {match.currentInnings === 2 ? " · Chase" : " · Bat"}
            </span>
          </div>
          <span className="text-[9px] font-mono text-mustard-gold/90 font-bold uppercase">
            {oversLimit} Overs
          </span>
        </div>

        {batting && (
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] sm:text-sm font-semibold tracking-wide truncate">
                {battingTeam?.name}
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl sm:text-4xl font-mono font-bold text-mustard-gold tabular-nums leading-none">
                  {tot?.runs ?? 0}
                  <span className="text-white/50 text-2xl">/{tot?.wickets ?? 0}</span>
                </span>
                <span className="text-xs font-mono text-white/55">
                  ({oversNow}/{oversLimit})
                </span>
              </div>
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              <p className="text-[9px] font-mono text-white/40 uppercase">CRR</p>
              <p className="text-base font-mono font-bold text-white tabular-nums">
                {crr}
              </p>
            </div>
          </div>
        )}

        {/* Opponent / 1st innings line */}
        <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-[10px] font-mono text-white/55">
          {match.currentInnings === 2 && firstInningsTeam ? (
            <>
              <span className="truncate">
                {bowlingTeam?.name}{" "}
                <span className="text-white/80 font-bold">
                  {firstInningsScore}/{firstInningsWkts}
                </span>
              </span>
              <span>({ballsToOvers(firstInningsBalls)})</span>
            </>
          ) : (
            <>
              <span className="truncate">{bowlingTeam?.name}</span>
              <span className="uppercase tracking-wider text-white/40">
                Yet to bat
              </span>
            </>
          )}
        </div>

        {/* Chase strip */}
        {isLive && target != null && (
          <div className="mt-2.5 rounded-lg bg-black/25 px-2.5 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono">
              <span>
                <span className="text-white/40">Target </span>
                <span className="font-bold text-mustard-gold">{target}</span>
              </span>
              <span>
                <span className="text-white/40">Need </span>
                <span className="font-bold text-white">
                  {runsNeeded} runs
                </span>
              </span>
              <span>
                <span className="text-white/40">in </span>
                <span className="font-bold text-white">{ballsLeft} balls</span>
              </span>
            </div>
            {rrr && (
              <span className="text-[10px] font-mono">
                <span className="text-white/40">RRR </span>
                <span className="font-bold text-red-300">{rrr}</span>
              </span>
            )}
          </div>
        )}

        {isLive && projected != null && target == null && (
          <div className="mt-2 text-[10px] font-mono text-white/50">
            Projected{" "}
            <span className="font-bold text-sky-300">~{projected}</span>
          </div>
        )}
      </div>

      {/* This over */}
      {isLive && (
        <div className="px-3.5 py-3 bg-[#f8faf8] border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-deep-forest/55">
              This over
              <span className="ml-1.5 text-deep-forest/35 font-normal normal-case tracking-normal">
                {oversNow} · {overRuns} run{overRuns === 1 ? "" : "s"}
              </span>
            </p>
            {partnership && (
              <p className="text-[10px] font-mono text-deep-forest/50">
                Pship{" "}
                <span className="font-bold text-deep-forest">
                  {partnership.runs}
                </span>
                <span className="text-deep-forest/40">
                  ({partnership.balls})
                </span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {currentOverBalls.length === 0 ? (
              <span className="text-[10px] font-mono text-slate-400">
                Over starting…
              </span>
            ) : (
              currentOverBalls.map((b, i) => (
                <BallDot key={b.id || i} ball={b} size="lg" />
              ))
            )}
            {Array.from({
              length: Math.max(0, 6 - currentOverBalls.filter((b) => b.isLegal).length),
            }).map((_, i) => (
              <span
                key={`empty-${i}`}
                className="inline-flex w-9 h-9 rounded-full border border-dashed border-slate-300 text-slate-300 items-center justify-center text-[10px] font-mono"
              >
                ·
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Batters table */}
      {isLive && (strikerPlayer || nonStrikerPlayer) && (
        <div className="border-b border-slate-100 overflow-x-auto">
          <div className="min-w-[320px]">
          <div className="grid grid-cols-[1fr_2.2rem_2.2rem_1.8rem_1.8rem_3rem] gap-1 px-3.5 py-1.5 bg-slate-50 text-[8px] font-mono uppercase tracking-wider text-slate-400 font-bold">
            <span>Batter</span>
            <span className="text-right">R</span>
            <span className="text-right">B</span>
            <span className="text-right">4s</span>
            <span className="text-right">6s</span>
            <span className="text-right">SR</span>
          </div>
          {[
            { player: strikerPlayer, stats: strikerStats, onStrike: true },
            { player: nonStrikerPlayer, stats: nonStrikerStats, onStrike: false },
          ]
            .filter((x) => x.player)
            .map(({ player, stats, onStrike }) => (
              <div
                key={player.id}
                className={`grid grid-cols-[1fr_2.2rem_2.2rem_1.8rem_1.8rem_3rem] gap-1 px-3.5 py-2.5 items-center ${
                  onStrike ? "bg-[#0d472c]/[0.06]" : "bg-white"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-5 h-5 rounded text-[8px] font-mono font-bold flex items-center justify-center shrink-0 ${
                      onStrike
                        ? "bg-mustard-gold text-deep-forest"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {player.shirtNumber ?? "·"}
                  </span>
                  <span
                    className={`text-[12px] font-semibold truncate ${
                      onStrike ? "text-deep-forest" : "text-slate-700"
                    }`}
                  >
                    {player.name}
                    {onStrike ? (
                      <span className="text-mustard-gold-hover ml-0.5">*</span>
                    ) : null}
                  </span>
                </div>
                <span className="text-right text-sm font-mono font-bold text-deep-forest tabular-nums">
                  {stats?.runs ?? 0}
                </span>
                <span className="text-right text-[11px] font-mono text-slate-500 tabular-nums">
                  {stats?.ballsFaced ?? 0}
                </span>
                <span className="text-right text-[11px] font-mono text-slate-500 tabular-nums">
                  {stats?.fours ?? 0}
                </span>
                <span className="text-right text-[11px] font-mono text-slate-500 tabular-nums">
                  {stats?.sixes ?? 0}
                </span>
                <span className="text-right text-[11px] font-mono text-slate-500 tabular-nums">
                  {stats?.sr ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bowler row */}
      {isLive && bowlerPlayer && bowlerStats && (
        <div className="border-b border-slate-100 overflow-x-auto">
          <div className="min-w-[320px]">
          <div className="grid grid-cols-[1fr_2.5rem_1.8rem_2.2rem_1.8rem_3rem] gap-1 px-3.5 py-1.5 bg-slate-50 text-[8px] font-mono uppercase tracking-wider text-slate-400 font-bold">
            <span>Bowler</span>
            <span className="text-right">O</span>
            <span className="text-right">M</span>
            <span className="text-right">R</span>
            <span className="text-right">W</span>
            <span className="text-right">Econ</span>
          </div>
          <div className="grid grid-cols-[1fr_2.5rem_1.8rem_2.2rem_1.8rem_3rem] gap-1 px-3.5 py-2.5 items-center">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-5 h-5 rounded bg-[#7c3aed]/15 text-[#6d28d9] text-[8px] font-mono font-bold flex items-center justify-center shrink-0">
                {bowlerPlayer.shirtNumber ?? "·"}
              </span>
              <span className="text-[12px] font-semibold text-deep-forest truncate">
                {bowlerPlayer.name}
              </span>
            </div>
            <span className="text-right text-[11px] font-mono font-bold text-deep-forest tabular-nums">
              {bowlerStats.oversStr}
            </span>
            <span className="text-right text-[11px] font-mono text-slate-500 tabular-nums">
              {bowlerStats.maidens}
            </span>
            <span className="text-right text-[11px] font-mono text-slate-500 tabular-nums">
              {bowlerStats.runs}
            </span>
            <span className="text-right text-[11px] font-mono font-bold text-deep-forest tabular-nums">
              {bowlerStats.wickets}
            </span>
            <span className="text-right text-[11px] font-mono text-slate-500 tabular-nums">
              {bowlerStats.economy}
            </span>
          </div>
          </div>
        </div>
      )}

      {/* Recent overs */}
      {isLive && lastOvers.length > 0 && (
        <div className="px-3.5 py-2.5 flex items-center gap-2 flex-wrap bg-white">
          <span className="text-[8px] font-mono uppercase tracking-widest text-slate-400 font-bold shrink-0">
            Recent
          </span>
          {lastOvers.map((o) => (
            <span
              key={o.over}
              className="text-[10px] font-mono bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5 text-slate-600"
            >
              {o.over}
              <span className="text-slate-300 mx-0.5">·</span>
              <span className="font-bold text-deep-forest">
                {o.runs}
                {o.wkts > 0 ? `/${o.wkts}W` : ""}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SetScoreBlock({ match, compact, sport = null }) {
  const sets = match.matchSets || [];
  const completedSets = sets.filter((s) => s.winnerId);
  const currentSet = sets.find((s) => s.setNumber === match.currentSet) || {
    scoreA: 0,
    scoreB: 0,
  };
  const isLive = match.status === "LIVE";
  const unit = String(sport || "").toUpperCase() === "BADMINTON" ? "Games" : "Sets";
  const unitOne = String(sport || "").toUpperCase() === "BADMINTON" ? "game" : "set";

  if (match.status === "SCHEDULED" && sets.length === 0) {
    return <span className="font-mono text-[10px] text-slate-400 uppercase">Upcoming</span>;
  }

  // Live: show rally points as the main score; sets/games won underneath
  if (isLive) {
    return (
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-1">
          <span className={`font-mono font-bold text-white bg-[#0a331f] rounded-xl shadow border border-black inline-block ${compact ? "text-base px-2 py-1.5" : "text-xl sm:text-2xl px-3 py-2"}`}>
            {currentSet.scoreA}
          </span>
          <span className="text-slate-300 font-mono text-xs">–</span>
          <span className={`font-mono font-bold text-white bg-[#0a331f] rounded-xl shadow border border-black inline-block ${compact ? "text-base px-2 py-1.5" : "text-xl sm:text-2xl px-3 py-2"}`}>
            {currentSet.scoreB}
          </span>
        </div>
        <p className="text-[9px] font-mono text-deep-forest/50">
          {unit} {match.scoreA}–{match.scoreB}
          {currentSet.setNumber ? ` · ${unitOne} ${currentSet.setNumber}` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="text-center space-y-1">
      <div className="flex items-center justify-center gap-1">
        <span className={`font-mono font-bold text-white bg-[#0a331f] rounded-xl shadow border border-black inline-block ${compact ? "text-base px-2 py-1.5" : "text-xl sm:text-2xl px-3 py-2"}`}>
          {match.scoreA}
        </span>
        <span className="text-slate-300 font-mono text-xs">–</span>
        <span className={`font-mono font-bold text-white bg-[#0a331f] rounded-xl shadow border border-black inline-block ${compact ? "text-base px-2 py-1.5" : "text-xl sm:text-2xl px-3 py-2"}`}>
          {match.scoreB}
        </span>
      </div>
      {completedSets.length > 0 && !compact && (
        <div className="flex flex-wrap gap-1 justify-center">
          {completedSets.map((s) => (
            <span key={s.id || s.setNumber} className="text-[8px] font-mono text-deep-forest/40 bg-slate-100 rounded px-1.5 py-0.5">
              {s.scoreA}–{s.scoreB}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function eventLabel(type) {
  const t = String(type || "").toUpperCase();
  if (t === "GOAL") return "Goal";
  if (t === "OWN_GOAL") return "Own goal";
  if (t === "PENALTY_GOAL") return "Penalty";
  if (t === "PENALTY_MISS") return "Pen miss";
  if (t === "SHOOTOUT_SCORED") return "Shootout ✓";
  if (t === "SHOOTOUT_MISSED") return "Shootout ✗";
  if (t === "YELLOW_CARD") return "Yellow";
  if (t === "RED_CARD") return "Red";
  return t.replace(/_/g, " ");
}

function eventAccent(type) {
  const t = String(type || "").toUpperCase();
  if (t === "GOAL" || t === "PENALTY_GOAL" || t === "SHOOTOUT_SCORED")
    return "bg-emerald-500";
  if (t === "OWN_GOAL") return "bg-slate-500";
  if (t === "PENALTY_MISS" || t === "SHOOTOUT_MISSED") return "bg-red-500";
  if (t === "YELLOW_CARD") return "bg-yellow-400";
  if (t === "RED_CARD") return "bg-red-500";
  return "bg-slate-400";
}

/** Sofascore-style football live board */
function FootballLiveCard({ match, tournamentId = null, category = null }) {
  const isLive = match.status === "LIVE";
  const isCompleted = match.status === "COMPLETED";
  const teamA = match.teamA;
  const teamB = match.teamB;
  const [now, setNow] = useState(() => Date.now());
  const clockOpts = footballClockOpts(match);
  const clockPaused = isFootballClockPaused(match);
  const fullTimeMinutes = category?.fullTimeMinutes ?? match?.fullTimeMinutes;

  useEffect(() => {
    if (!isLive || !match.kickoffAt || clockPaused) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive, match.kickoffAt, clockPaused]);

  const elapsed = footballElapsedSeconds(match.kickoffAt, now, clockOpts);
  const clockLabel = isCompleted
    ? completedFootballClockLabel({
        fullTimeMinutes,
        extraTimeMinutes: category?.extraTimeMinutes,
        stoppageMinutes: match.stoppageMinutes,
        tournamentId,
        kickoffAt: match.kickoffAt,
        clockOpts,
        now,
      })
    : match.kickoffAt
      ? formatFootballClock(elapsed)
      : isLive
        ? "00:00"
        : null;
  const period = normalizeFootballPeriod(match.clockPeriod, match.status);
  const periodShort = footballPeriodShort(match.clockPeriod, match.status);
  const liveMinute = footballLiveMinuteLabel(match, now, fullTimeMinutes);
  const minuteLabel =
    liveMinute ||
    (match.kickoffAt
      ? `${footballDisplayMinute(match.kickoffAt, now, clockOpts)}'`
      : null);

  const events = [...(match.events || [])].sort((a, b) => {
    const ma = a.minute ?? 999;
    const mb = b.minute ?? 999;
    if (ma !== mb) return ma - mb;
    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });
  const goals = events.filter((e) => {
    const t = String(e.type || "").toUpperCase();
    return t === "GOAL" || t === "OWN_GOAL";
  });

  return (
    <div className="rounded-2xl overflow-hidden border border-[#0d472c]/25 bg-white shadow-md h-auto">
      <div className="bg-gradient-to-r from-[#0a331f] via-[#0d472c] to-[#0a331f] px-3.5 py-3 text-white">
        <div className="flex items-center justify-between mb-3">
          {isLive ? (
            period === FOOTBALL_PERIODS.HALF_TIME ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded">
                HT
              </span>
            ) : clockPaused ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded">
                Paused
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-red-600 text-white px-2 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                Live · {periodShort}
              </span>
            )
          ) : (
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-white/50">
              {isCompleted ? "Full time" : match.status}
            </span>
          )}
          <span className="text-[9px] font-mono text-mustard-gold/90 font-bold uppercase">
            Football
          </span>
        </div>

        {/* Match timer */}
        {(isLive || (isCompleted && clockLabel)) && (
          <div className="mb-3 flex items-center justify-center gap-2 flex-wrap">
            <div
              className={`inline-flex items-center gap-2 bg-black/30 border rounded-xl px-4 py-1.5 ${
                clockPaused || period === FOOTBALL_PERIODS.HALF_TIME
                  ? "border-amber-400/50"
                  : "border-white/10"
              }`}
            >
              <span className="text-[8px] font-mono uppercase tracking-widest text-white/45">
                {isCompleted
                  ? "FT"
                  : period === FOOTBALL_PERIODS.HALF_TIME
                    ? "HT"
                    : clockPaused
                      ? "Paused"
                      : periodShort}
              </span>
              <span
                className={`text-xl sm:text-2xl font-mono font-bold tabular-nums tracking-wider ${
                  clockPaused || period === FOOTBALL_PERIODS.HALF_TIME
                    ? "text-amber-300"
                    : "text-mustard-gold"
                }`}
              >
                {clockLabel || "00:00"}
              </span>
              {isLive && minuteLabel != null && (
                <span className="text-[10px] font-mono text-white/50">
                  ({minuteLabel})
                </span>
              )}
            </div>
            {(match.stoppageMinutes || 0) > 0 && (
              <span className="inline-flex items-center bg-mustard-gold text-deep-forest text-xs font-mono font-bold px-2.5 py-1.5 rounded-lg">
                +{match.stoppageMinutes}&apos;
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex flex-col items-center gap-1.5 min-w-0 text-center">
            {teamA?.logoUrl ? (
              <img
                src={teamA.logoUrl}
                alt=""
                className="w-11 h-11 rounded-full object-cover border-2 border-white/20"
              />
            ) : (
              <span className="w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-bold">
                {(teamA?.name || "??").slice(0, 2).toUpperCase()}
              </span>
            )}
            <p className="text-[11px] sm:text-xs font-semibold leading-tight line-clamp-2">
              {teamA?.name || "TBD"}
            </p>
          </div>

          <div className="text-center px-1">
            <div className="flex items-baseline justify-center gap-1.5 font-mono font-bold tabular-nums">
              <span className="text-3xl sm:text-4xl text-mustard-gold">{match.scoreA}</span>
              <span className="text-white/35 text-lg">:</span>
              <span className="text-3xl sm:text-4xl text-mustard-gold">{match.scoreB}</span>
            </div>
            <p className="text-[9px] font-mono text-white/40 uppercase mt-1 tracking-wider">
              {isLive
                ? period === FOOTBALL_PERIODS.HALF_TIME
                  ? "Half-time"
                  : "Match in progress"
                : isCompleted
                  ? "FT"
                  : "Score"}
            </p>
            {(match.penaltyScoreA > 0 || match.penaltyScoreB > 0) && (
              <p className="text-[10px] font-mono text-mustard-gold/80 mt-0.5">
                Pens {match.penaltyScoreA}-{match.penaltyScoreB}
              </p>
            )}
          </div>

          <div className="flex flex-col items-center gap-1.5 min-w-0 text-center">
            {teamB?.logoUrl ? (
              <img
                src={teamB.logoUrl}
                alt=""
                className="w-11 h-11 rounded-full object-cover border-2 border-white/20"
              />
            ) : (
              <span className="w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-bold">
                {(teamB?.name || "??").slice(0, 2).toUpperCase()}
              </span>
            )}
            <p className="text-[11px] sm:text-xs font-semibold leading-tight line-clamp-2">
              {teamB?.name || "TBD"}
            </p>
          </div>
        </div>
      </div>

      {/* Goal scorers strip */}
      {goals.length > 0 && (
        <div className="px-3.5 py-2.5 bg-[#f8faf8] border-b border-slate-100">
          <p className="text-[8px] font-mono uppercase tracking-widest text-slate-400 font-bold mb-1.5">
            Goals
          </p>
          <div className="space-y-1">
            {goals.map((e) => {
              const isA =
                e.teamId === match.teamAId ||
                e.teamId === match.resolvedTeamAId ||
                e.teamId === match.teamA?.id;
              const name = e.player?.name || "Unknown";
              const t = String(e.type || "").toUpperCase();
              const tag = t === "OWN_GOAL" ? " (OG)" : "";
              return (
                <div
                  key={e.id}
                  className={`flex items-center gap-2 text-[11px] font-mono ${
                    isA ? "justify-start" : "justify-end flex-row-reverse"
                  }`}
                >
                  <span className="text-slate-400 tabular-nums w-10 shrink-0">
                    {formatEventMinute(
                      e.minute,
                      match.stoppageMinutes,
                      fullTimeMinutes
                    )}
                  </span>
                  <span
                    className={`font-semibold text-deep-forest truncate ${
                      isA ? "text-left" : "text-right"
                    }`}
                  >
                    {name}
                    {tag}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Event timeline — only when there is data */}
      {events.length > 0 && (
        <div className="px-3.5 py-3">
          <p className="text-[8px] font-mono uppercase tracking-widest text-slate-400 font-bold mb-2">
            Match events
          </p>
          <ul className="space-y-1.5 max-h-40 overflow-y-auto">
            {[...events].reverse().map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-2 text-[11px] bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${eventAccent(e.type)}`}
                />
                <span className="font-mono text-slate-400 tabular-nums w-10 shrink-0">
                  {formatEventMinute(
                    e.minute,
                    match.stoppageMinutes,
                    fullTimeMinutes
                  )}
                </span>
                <span className="font-semibold text-deep-forest truncate flex-1">
                  {e.player?.name || "—"}
                </span>
                <span className="text-[9px] font-mono uppercase text-slate-500 shrink-0">
                  {eventLabel(e.type)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Live only: compact waiting line — completed with no events stays flush */}
      {events.length === 0 && isLive && (
        <div className="px-3.5 py-2 text-center text-[10px] font-mono text-slate-400">
          Waiting for first event…
        </div>
      )}
    </div>
  );
}

/** Volleyball / Badminton / Pickleball live board */
function SetBasedLiveCard({ match, sport, category = null }) {
  const config = getConfig(sport, category) || SPORT_CONFIGS.VOLLEYBALL;
  const isLive = match.status === "LIVE";
  const isCompleted = match.status === "COMPLETED";
  const sets = [...(match.matchSets || [])].sort(
    (a, b) => a.setNumber - b.setNumber
  );
  const currentSetNum = match.currentSet || 1;
  const currentSet =
    sets.find((s) => s.setNumber === currentSetNum) || {
      setNumber: currentSetNum,
      scoreA: 0,
      scoreB: 0,
      winnerId: null,
    };
  const completedSets = sets.filter((s) => s.winnerId);
  const target = getSetTarget(currentSetNum, config);
  const teamA = match.teamA;
  const teamB = match.teamB;

  return (
    <div className="rounded-2xl overflow-hidden border border-[#0d472c]/25 bg-white shadow-md">
      <div className="bg-gradient-to-r from-[#0a331f] via-[#0d472c] to-[#0a331f] px-3.5 py-3 text-white">
        <div className="flex items-center justify-between mb-3">
          {isLive ? (
            <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-red-600 text-white px-2 py-0.5 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Live
            </span>
          ) : (
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-white/50">
              {isCompleted ? "Final" : match.status}
            </span>
          )}
          <span className="text-[9px] font-mono text-mustard-gold/90 font-bold uppercase">
            {config.icon} {config.name}
          </span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex flex-col items-center gap-1.5 min-w-0 text-center">
            {teamA?.logoUrl ? (
              <img
                src={teamA.logoUrl}
                alt=""
                className="w-11 h-11 rounded-full object-cover border-2 border-white/20"
              />
            ) : (
              <span className="w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-bold">
                {(teamA?.name || "??").slice(0, 2).toUpperCase()}
              </span>
            )}
            <p className="text-[11px] sm:text-xs font-semibold leading-tight line-clamp-2">
              {teamA?.name || "TBD"}
            </p>
          </div>

          <div className="text-center px-1">
            {isLive ? (
              <>
                <p className="text-[8px] font-mono text-white/40 uppercase tracking-wider mb-0.5">
                  {sport === "BADMINTON" ? "Game" : "Set"} {currentSetNum}
                </p>
                <div className="flex items-baseline justify-center gap-1.5 font-mono font-bold tabular-nums">
                  <span className="text-3xl sm:text-4xl text-mustard-gold">
                    {currentSet.scoreA}
                  </span>
                  <span className="text-white/35 text-lg">–</span>
                  <span className="text-3xl sm:text-4xl text-mustard-gold">
                    {currentSet.scoreB}
                  </span>
                </div>
                <p className="text-[9px] font-mono text-white/50 mt-1">
                  {sport === "BADMINTON" ? "Games" : "Sets"}{" "}
                  <span className="font-bold text-white">
                    {match.scoreA}–{match.scoreB}
                  </span>
                  <span className="text-white/35"> · to {target}</span>
                </p>
              </>
            ) : (
              <>
                <p className="text-[8px] font-mono text-white/40 uppercase tracking-wider mb-0.5">
                  {sport === "BADMINTON" ? "Games" : "Sets"}
                </p>
                <div className="flex items-baseline justify-center gap-1.5 font-mono font-bold tabular-nums">
                  <span className="text-3xl sm:text-4xl text-mustard-gold">
                    {match.scoreA}
                  </span>
                  <span className="text-white/35 text-lg">–</span>
                  <span className="text-3xl sm:text-4xl text-mustard-gold">
                    {match.scoreB}
                  </span>
                </div>
                <p className="text-[9px] font-mono text-white/40 mt-1">
                  First to {config.setsToWin}
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col items-center gap-1.5 min-w-0 text-center">
            {teamB?.logoUrl ? (
              <img
                src={teamB.logoUrl}
                alt=""
                className="w-11 h-11 rounded-full object-cover border-2 border-white/20"
              />
            ) : (
              <span className="w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-bold">
                {(teamB?.name || "??").slice(0, 2).toUpperCase()}
              </span>
            )}
            <p className="text-[11px] sm:text-xs font-semibold leading-tight line-clamp-2">
              {teamB?.name || "TBD"}
            </p>
          </div>
        </div>
      </div>

      {/* Current set detail — only when not already shown as hero */}
      {isLive && (
        <div className="px-3.5 py-3 bg-[#f8faf8] border-b border-slate-100 text-center">
          <p className="text-[8px] font-mono uppercase tracking-widest text-slate-400 font-bold mb-1.5">
            Play to {target}
            {config.winByTwo ? " · win by 2" : ""}
            {config.pointCap ? ` · cap ${config.pointCap}` : ""}
          </p>
          <div className="h-1.5 max-w-[200px] mx-auto bg-slate-200 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-[#0d472c] transition-all"
              style={{
                width: `${
                  currentSet.scoreA + currentSet.scoreB === 0
                    ? 50
                    : (currentSet.scoreA /
                        (currentSet.scoreA + currentSet.scoreB)) *
                      100
                }%`,
              }}
            />
            <div className="h-full bg-mustard-gold flex-1" />
          </div>
        </div>
      )}

      {/* Set history */}
      <div className="px-3.5 py-3">
        <p className="text-[8px] font-mono uppercase tracking-widest text-slate-400 font-bold mb-2">
          {sport === "BADMINTON" ? "Game scores" : "Set scores"}
        </p>
        {sets.length === 0 ? (
          <p className="text-[10px] font-mono text-slate-400 text-center py-2">
            {isLive ? "Set 1 starting…" : "No sets yet"}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 justify-center">
            {sets.map((s) => {
              const done = !!s.winnerId;
              const isCurrent = !done && s.setNumber === currentSetNum && isLive;
              return (
                <div
                  key={s.id || s.setNumber}
                  className={`min-w-[4.5rem] rounded-xl border px-2.5 py-2 text-center ${
                    isCurrent
                      ? "border-mustard-gold bg-mustard-gold/10 ring-1 ring-mustard-gold/40"
                      : done
                        ? "border-slate-200 bg-white"
                        : "border-dashed border-slate-200 bg-slate-50"
                  }`}
                >
                  <p className="text-[8px] font-mono uppercase text-slate-400 font-bold">
                    Set {s.setNumber}
                  </p>
                  <p className="text-sm font-mono font-bold text-deep-forest tabular-nums mt-0.5">
                    {s.scoreA}–{s.scoreB}
                  </p>
                  {done && (
                    <p className="text-[8px] font-mono text-emerald-600 mt-0.5">
                      {s.winnerId === match.teamAId
                        ? teamA?.name?.slice(0, 8) || "A"
                        : teamB?.name?.slice(0, 8) || "B"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {completedSets.length > 0 && isCompleted && (
          <p className="text-center text-[10px] font-mono text-deep-forest/60 mt-3">
            {match.scoreA > match.scoreB
              ? `${teamA?.name || "Home"} wins ${match.scoreA}–${match.scoreB}`
              : `${teamB?.name || "Away"} wins ${match.scoreB}–${match.scoreA}`}
          </p>
        )}
      </div>
    </div>
  );
}

function MasonryMatchGrid({ children, dense = false }) {
  const items = Children.toArray(children).filter(Boolean);
  const gap = dense ? "gap-4" : "gap-6";

  if (items.length === 0) return null;

  // One card → full width (don't leave an empty right column)
  if (items.length === 1) {
    return <div className={`grid grid-cols-1 ${gap}`}>{items}</div>;
  }

  // Even → left, odd → right so short left cards get the next card packed underneath
  const left = items.filter((_, i) => i % 2 === 0);
  const right = items.filter((_, i) => i % 2 === 1);

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 ${gap} items-start`}>
      <div className={`flex flex-col ${gap} min-w-0`}>{left}</div>
      {right.length > 0 ? (
        <div className={`flex flex-col ${gap} min-w-0`}>{right}</div>
      ) : null}
    </div>
  );
}

function MatchCard({
  match,
  compact = false,
  categoryName = null,
  category = null,
  isCricket = false,
  isSetBased = false,
  tournamentId = null,
}) {
  const [expanded, setExpanded] = useState(false);
  const isLive = match.status === "LIVE";
  const isCompleted = match.status === "COMPLETED";
  const usePolishedBoard = isLive || isCompleted;

  const teamA = withTeamLogo(match.teamA, category);
  const teamB = withTeamLogo(match.teamB, category);
  const rosterA = category?.teams?.find((t) => t.id === match.teamAId);
  const rosterB = category?.teams?.find((t) => t.id === match.teamBId);
  const teamAPlayers = rosterA?.players || teamA?.players || match.teamA?.players || [];
  const teamBPlayers = rosterB?.players || teamB?.players || match.teamB?.players || [];
  const badgeSize = isLive && !compact ? "xl" : compact ? "sm" : "md";
  const sportKey = category?.sport || "FOOTBALL";

  const liveBoard = isCricket ? (
    <CricketLiveCard match={match} category={category} />
  ) : isSetBased ? (
    <SetBasedLiveCard match={match} sport={sportKey} category={category} />
  ) : (
    <FootballLiveCard
      match={match}
      tournamentId={tournamentId}
      category={category}
    />
  );

  const squadPanel = (
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
  );

  return (
    <div
      className={`w-full h-fit max-h-none self-start bg-white rounded-2xl border-2 p-3 sm:p-4 transition-all flex flex-col ${
        isLive
          ? "border-red-400 shadow-md ring-2 ring-red-100"
          : "border-dashed border-mustard-gold/70"
      }`}
    >
      <div className="flex flex-wrap justify-between items-center mb-3 gap-2 shrink-0">
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
        {!isLive && !isCompleted && match.scheduledAt ? (
          <span
            className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-1 rounded-md border tracking-wider bg-mustard-gold/15 text-deep-forest border-mustard-gold/40 shrink-0"
            title="Planned start time"
          >
            <Clock className="w-3 h-3 opacity-70" />
            {formatScheduledAt(match.scheduledAt)}
          </span>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
          {isCricket && match.oversLimit ? (
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-deep-forest/60 bg-cream-bg border border-slate-200 rounded-md px-2 py-0.5">
              {match.oversLimit} ov
            </span>
          ) : null}
          {isSetBased && SPORT_CONFIGS[sportKey] ? (
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-deep-forest/60 bg-cream-bg border border-slate-200 rounded-md px-2 py-0.5">
              {SPORT_CONFIGS[sportKey].icon} {SPORT_CONFIGS[sportKey].name}
            </span>
          ) : null}
          {!isCricket && !isSetBased ? (
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-deep-forest/60 bg-cream-bg border border-slate-200 rounded-md px-2 py-0.5">
              Football
            </span>
          ) : null}
          {categoryName ? (
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-mustard-gold-hover bg-mustard-gold/15 border border-mustard-gold/40 rounded-md px-2 py-0.5">
              {categoryName}
            </span>
          ) : null}
        </div>
      </div>

      {usePolishedBoard ? (
        <div className="flex flex-col gap-2 h-fit shrink-0">
          <div className="h-fit shrink-0">{liveBoard}</div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full shrink-0 text-[10px] font-mono font-bold uppercase tracking-wider text-deep-forest/50 hover:text-deep-forest py-2 border border-dashed border-slate-200 rounded-xl cursor-pointer"
          >
            {expanded ? "Hide squads" : "Show squads"}
          </button>
          {expanded ? <div className="h-fit shrink-0">{squadPanel}</div> : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left cursor-pointer"
        >
          {!expanded ? (
            isCricket ? (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                <div className="flex flex-col items-center gap-2 min-w-0">
                  <TeamBadge team={teamA} size={badgeSize} />
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide line-clamp-2 leading-tight">
                    {teamA?.name}
                  </span>
                  <CricketScoreBlock
                    match={match}
                    teamId={match.teamAId}
                    compact={compact}
                  />
                </div>
                <span className="text-slate-300 font-mono text-xs font-bold">vs</span>
                <div className="flex flex-col items-center gap-2 min-w-0">
                  <TeamBadge team={teamB} size={badgeSize} />
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide line-clamp-2 leading-tight">
                    {teamB?.name}
                  </span>
                  <CricketScoreBlock
                    match={match}
                    teamId={match.teamBId}
                    compact={compact}
                  />
                </div>
              </div>
            ) : isSetBased ? (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                <div className="flex flex-col items-center gap-2 min-w-0">
                  <TeamBadge team={teamA} size={badgeSize} />
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide line-clamp-2 leading-tight">
                    {teamA?.name}
                  </span>
                </div>
                <SetScoreBlock match={match} compact={compact} sport={sportKey} />
                <div className="flex flex-col items-center gap-2 min-w-0">
                  <TeamBadge team={teamB} size={badgeSize} />
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide line-clamp-2 leading-tight">
                    {teamB?.name}
                  </span>
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
                      compact
                        ? "text-lg px-2.5 py-1.5 min-w-[34px]"
                        : "text-2xl sm:text-3xl px-3.5 py-2 min-w-[44px]"
                    }`}
                  >
                    {match.scoreA}
                  </span>
                  <span className="text-slate-400 font-bold font-mono">:</span>
                  <span
                    className={`font-mono font-bold text-white bg-[#0a331f] rounded-xl shadow border border-black ${
                      compact
                        ? "text-lg px-2.5 py-1.5 min-w-[34px]"
                        : "text-2xl sm:text-3xl px-3.5 py-2 min-w-[44px]"
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
              {liveBoard}
              {squadPanel}
            </div>
          )}
        </button>
      )}
    </div>
  );
}

export default function PublicLiveBoard() {
  const { id } = useParams();
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [section, setSection] = useState("clubs"); // clubs, live, schedule, table, scorers
  const [expandedClubId, setExpandedClubId] = useState(null);
  const prevLiveCountRef = useRef(0);
  const prevCompletedIdsRef = useRef(null);
  const userPickedCategoryRef = useRef(false);
  const categoryStorageKey = id ? `md_active_category_${id}` : null;
  const defaultSectionSetRef = useRef(false);
  const serverTimeRef = useRef(null);
  const deltaFailRef = useRef(0);
  const hasLiveMatchRef = useRef(false);
  const snapshotInFlightRef = useRef(false);
  const deltaInFlightRef = useRef(false);
  const pollTicksRef = useRef(0);

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

  const syncBoardMeta = useCallback((data) => {
    const dayStarted = hasTournamentDayStarted(data);
    if (!defaultSectionSetRef.current) {
      defaultSectionSetRef.current = true;
      setSection(dayStarted ? "live" : "clubs");
    }

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
    hasLiveMatchRef.current = liveCount > 0;
    if (liveCount > 0 && prevLiveCountRef.current === 0) {
      setSection("live");
    }
    prevLiveCountRef.current = liveCount;

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
      if (!userPickedCategoryRef.current && liveInAny.length > 0) {
        return liveInAny[0].categoryId;
      }
      return data.categories?.[0]?.id || null;
    });

    setUpdatedAt(new Date());
  }, [categoryStorageKey]);

  /** Full snapshot bootstrap (and rare fallback). */
  const fetchSnapshot = useCallback(
    async ({ silent = false } = {}) => {
      if (snapshotInFlightRef.current) return null;
      snapshotInFlightRef.current = true;
      try {
        const res = await fetch(`/api/tournaments/${id}?view=live`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Tournament not found");
        const data = await res.json();
        serverTimeRef.current = data.serverTime || new Date().toISOString();
        setTournament((prev) => mergeLiveBoardSnapshot(prev, data));
        syncBoardMeta(data);
        deltaFailRef.current = 0;
        if (!silent) setError(null);
        return data;
      } catch (err) {
        if (!silent) setError(err.message);
        return null;
      } finally {
        snapshotInFlightRef.current = false;
        if (!silent) setLoading(false);
      }
    },
    [id, syncBoardMeta]
  );

  /** Cheap incremental poll — LIVE + recently changed matches only. */
  const fetchDelta = useCallback(async () => {
    if (deltaInFlightRef.current) return;
    deltaInFlightRef.current = true;
    try {
      const since = serverTimeRef.current
        ? encodeURIComponent(serverTimeRef.current)
        : "";
      const res = await fetch(
        `/api/tournaments/${id}?view=delta${since ? `&since=${since}` : ""}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Delta failed");
      const delta = await res.json();
      if (delta.serverTime) serverTimeRef.current = delta.serverTime;

      setTournament((prev) => {
        if (!prev) return prev;
        const next = applyLiveBoardDelta(prev, delta.matches || []);
        Promise.resolve().then(() => syncBoardMeta(next));
        return next;
      });
      deltaFailRef.current = 0;
    } catch (err) {
      console.warn("Live delta failed:", err?.message || err);
      deltaFailRef.current += 1;
      if (deltaFailRef.current >= 3) {
        await fetchSnapshot({ silent: true });
      }
    } finally {
      deltaInFlightRef.current = false;
    }
  }, [id, syncBoardMeta, fetchSnapshot]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  // Bootstrap once, then poll deltas without pile-up
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, 3000);
        return;
      }

      pollTicksRef.current += 1;
      const snapshotEvery = hasSupabaseRealtimeEnv() ? 40 : 20;
      try {
        if (pollTicksRef.current % snapshotEvery === 0) {
          await fetchSnapshot({ silent: true });
        } else {
          await fetchDelta();
        }
      } catch {
        /* handled inside fetch helpers */
      }

      if (!cancelled) {
        const intervalMs = hasLiveMatchRef.current ? 2000 : 4000;
        timer = setTimeout(tick, intervalMs);
      }
    };

    timer = setTimeout(tick, 2500);

    const onVis = () => {
      if (!document.hidden) fetchDelta();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [fetchDelta, fetchSnapshot]);

  const boardMatchIds = useMemo(() => {
    const ids = new Set();
    for (const cat of tournament?.categories || []) {
      for (const round of cat.rounds || []) {
        for (const match of round.matches || []) {
          ids.add(match.id);
        }
      }
    }
    return ids;
  }, [tournament]);

  useMatchRealtime({
    enabled: !!tournament,
    onChange: fetchDelta,
    matchIds: boardMatchIds.size > 0 ? boardMatchIds : null,
  });

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

  // Public can browse clubs, schedule, and table before match day.
  const dayStarted = hasTournamentDayStarted(tournament);

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

  const categoryClubs = (activeCategory?.teams || [])
    .filter((t) => !isPlaceholderTeam(t.name))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const isCricket = activeCategory?.sport === "CRICKET";
  const isSetBased = isSetBasedSport(activeCategory?.sport);
  const sportConfig = isSetBased ? getConfig(activeCategory?.sport, activeCategory) : null;

  const footballStandings = calculateStandings(activeCategory);
  const cricketStandings = calculateCricketStandings(activeCategory).filter(
    (t) => !isPlaceholderTeam(t.name)
  );
  const setBasedStandings = isSetBased
    ? calculateSetBasedStandings(activeCategory).filter((t) => !isPlaceholderTeam(t.name))
    : [];
  const standings = isCricket
    ? cricketStandings
    : isSetBased
      ? setBasedStandings
      : footballStandings;
  const topScorers = calculateTopScorers(activeCategory);
  const cricketLeaders = isCricket
    ? calculateCricketLeaders(activeCategory)
    : { runScorers: [], wicketTakers: [], bestFielders: [] };

  const sections = [
    {
      id: "clubs",
      label: "Clubs",
      icon: Users,
      count: categoryClubs.length,
    },
    {
      id: "live",
      label: "Matches",
      icon: Radio,
      count: categoryLiveMatches.length + categoryCompletedMatches.length,
    },
    { id: "schedule", label: "Schedule", icon: Calendar, count: allMatches.length },
    { id: "table", label: "Points Table", icon: Trophy, count: standings.length },
    ...(!isSetBased
      ? [
          {
            id: "scorers",
            label: isCricket ? "Leaders" : "Top Scorers",
            icon: Award,
            count: isCricket
              ? cricketLeaders.runScorers.length +
                cricketLeaders.wicketTakers.length +
                (cricketLeaders.bestFielders?.length || 0)
              : topScorers.length,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col min-h-screen bg-cream-bg text-deep-forest font-sans overflow-x-hidden safe-pad-bottom">
      <header className="pitch-stripes border-b-4 border-mustard-gold/80 shadow-md relative overflow-hidden py-8 safe-pad-top">
        <div className="absolute inset-0 bg-black/15 pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Link
                href="/"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-white/20 hover:border-white/40 bg-[#093c24]/80 text-white rounded-xl transition-all shrink-0"
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
                    <span className={`w-1.5 h-1.5 rounded-full ${dayStarted ? "bg-red-500 animate-pulse" : "bg-mustard-gold"}`} />
                    {dayStarted ? "Public Live Board" : "Tournament Preview"}
                  </span>
                  {updatedAt && (
                    <>
                      <span className="text-white/40 hidden sm:inline">•</span>
                      <span className="text-white/60 normal-case tracking-normal w-full sm:w-auto">
                        Updated {updatedAt.toLocaleTimeString()}
                        {hasSupabaseRealtimeEnv() ? " · live sync" : " · fast poll"}
                      </span>
                    </>
                  )}
                </div>
                <h1 className="text-xl sm:text-3xl md:text-4xl font-display uppercase text-white drop-shadow tracking-wide truncate">
                  {tournament.name}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-mono text-white/75">
                  {activeCategory && (
                    <span className="inline-flex items-center gap-1 bg-mustard-gold/20 border border-mustard-gold/40 text-mustard-gold rounded-lg px-2 py-0.5 font-bold uppercase tracking-wider">
                      {isCricket
                        ? `🏏 ${categoryDisplayName(activeCategory)}`
                        : isSetBased
                          ? `${sportConfig?.icon || ""} ${categoryDisplayName(activeCategory)}`
                          : `⚽ ${categoryDisplayName(activeCategory)}`}
                    </span>
                  )}
                  {tournament.startDate && (
                    <span className="inline-flex items-center gap-1 bg-white/10 border border-white/15 rounded-lg px-2 py-0.5">
                      <Calendar className="w-3 h-3 text-mustard-gold" />
                      {formatTournamentDate(tournament.startDate)}
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
        </div>
      </header>

      {(tournament.categories || []).length > 0 && (
        <div className="sticky z-30 bg-[#0a331f] border-b-4 border-mustard-gold shadow-md safe-sticky-top">
          <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="shrink-0">
                <p className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-[0.2em] text-mustard-gold">
                  Category
                </p>
                <p className="text-[10px] font-mono text-white/50 hidden sm:block">
                  Switch OPEN / age group
                </p>
              </div>
              <div className="flex-1 min-w-0 tab-scroll sm:flex-wrap sm:overflow-visible">
                {(tournament.categories || []).map((cat) => {
                  const active = cat.id === activeCategory?.id;
                  const clubs = (cat.teams || []).filter((t) => !isPlaceholderTeam(t.name)).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        selectCategory(cat.id);
                        setExpandedClubId(null);
                      }}
                      className={`relative inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-3 sm:py-4 rounded-xl font-display uppercase tracking-wide text-sm sm:text-xl border-2 min-h-[44px] sm:min-h-[60px] cursor-pointer transition-all max-w-[85vw] sm:max-w-none ${
                        active
                          ? "bg-mustard-gold text-deep-forest border-mustard-gold shadow-[0_4px_0_#0a331f] scale-[1.02]"
                          : "bg-[#0d472c] text-white/85 border-white/25 hover:border-mustard-gold/70 hover:text-white"
                      }`}
                    >
                      {active && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-mono font-bold uppercase tracking-widest bg-deep-forest text-mustard-gold px-2 py-0.5 rounded border border-mustard-gold/60">
                          Viewing
                        </span>
                      )}
                      <span className="truncate">{categoryDisplayName(cat)}</span>
                      <span
                        className={`text-sm sm:text-base font-mono font-bold normal-case tracking-normal shrink-0 ${
                          active ? "text-deep-forest/70" : "text-white/45"
                        }`}
                      >
                        {clubs}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="bg-white border-t border-slate-200">
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
        </div>
      )}

      {!dayStarted && (
        <div className="bg-[#0d472c] text-white py-2.5 text-center border-b border-mustard-gold/40">
          <div className="max-w-6xl mx-auto px-4 flex flex-wrap items-center justify-center gap-2 text-[10px] sm:text-xs font-mono font-bold tracking-wider uppercase">
            <Clock className="w-3.5 h-3.5 text-mustard-gold" />
            Preview mode — live scoring from {formatTournamentDate(tournament.startDate)}
          </div>
        </div>
      )}

      {allLiveMatches.length > 0 && (
        <div className="bg-red-600 text-white py-2.5 text-center">
          <div className="max-w-6xl mx-auto px-4 flex items-center justify-center gap-2 text-xs font-mono font-bold tracking-wider">
            <Activity className="w-4 h-4 animate-pulse" />
            {allLiveMatches.length} MATCH{allLiveMatches.length > 1 ? "ES" : ""} LIVE NOW
          </div>
        </div>
      )}

      {(tournament.categories || []).length === 0 && (
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
      )}

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 sm:py-8 space-y-8 sm:space-y-10">
        <ChampionCelebration
          category={activeCategory}
          rounds={rounds}
          standings={standings}
          isCricket={isCricket}
          isSetBased={isSetBased}
        />

        {section === "clubs" && (
          <section className="space-y-5 animate-fadeIn">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
                Clubs — {activeCategory?.name}
              </h2>
              <span className="text-[9px] font-mono text-deep-forest/45 uppercase tracking-wider">
                Tap a club for the squad
              </span>
            </div>

            {categoryClubs.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl py-12 px-6 text-center">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-mono text-deep-forest/50">No clubs registered yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 max-w-2xl mx-auto w-full">
                {categoryClubs.map((club) => {
                  const open = expandedClubId === club.id;
                  const players = [...(club.players || [])].sort(
                    (a, b) => (a.shirtNumber || 0) - (b.shirtNumber || 0)
                  );
                  return (
                    <button
                      key={club.id}
                      type="button"
                      onClick={() =>
                        setExpandedClubId((prev) => (prev === club.id ? null : club.id))
                      }
                      className={`w-full text-left bg-white rounded-2xl border-2 p-4 sm:p-5 transition-all cursor-pointer ${
                        open
                          ? "border-mustard-gold ring-2 ring-mustard-gold/30"
                          : "border-dashed border-mustard-gold/70 hover:border-solid"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <TeamBadge team={club} size="lg" />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-display uppercase tracking-wide text-deep-forest truncate">
                            {club.name}
                          </h3>
                          <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-deep-forest/50">
                            {players.length} player{players.length === 1 ? "" : "s"}
                            <span className="ml-2 text-deep-forest/35 normal-case tracking-normal">
                              {open ? "· hide" : "· tap for squad"}
                            </span>
                          </p>
                        </div>
                      </div>

                      {open && (
                        <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 animate-fadeIn">
                          {players.length === 0 ? (
                            <p className="text-[10px] font-mono text-deep-forest/40 py-2">
                              No players registered
                            </p>
                          ) : (
                            players.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between gap-2 text-xs bg-[#fcf7ed] rounded-lg px-3 py-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {p.logoUrl ? (
                                    <img
                                      src={p.logoUrl}
                                      alt=""
                                      className="w-7 h-7 rounded-full object-cover border border-mustard-gold/40 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[9px] font-bold text-deep-forest/50 shrink-0">
                                      {(p.name || "?").slice(0, 1).toUpperCase()}
                                    </div>
                                  )}
                                  <span className="font-sans font-bold uppercase truncate text-deep-forest">
                                    {p.name}
                                  </span>
                                </div>
                                <span className="text-[9px] font-mono font-bold text-deep-forest bg-mustard-gold/15 border border-mustard-gold/30 rounded px-1.5 py-0.5 shrink-0">
                                  No. {p.shirtNumber}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {section === "live" && (
          <section className="space-y-10 animate-fadeIn">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
                Match Centre — {activeCategory?.name}
              </h2>
              {!dayStarted && (
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-deep-forest/55 bg-cream-bg border border-slate-200 rounded-md px-2 py-0.5">
                  Live from {formatTournamentDate(tournament.startDate)}
                </span>
              )}
            </div>

            {!dayStarted && (
              <div className="bg-white border-2 border-dashed border-mustard-gold/50 rounded-2xl py-8 px-6 text-center">
                <Clock className="w-8 h-8 text-mustard-gold mx-auto mb-2" />
                <p className="text-xs font-mono text-deep-forest/60 leading-relaxed max-w-md mx-auto">
                  Live scoring opens on{" "}
                  <span className="font-bold text-deep-forest">
                    {formatTournamentDate(tournament.startDate)}
                  </span>
                  . Browse Clubs and Schedule meanwhile.
                </p>
              </div>
            )}

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
                <MasonryMatchGrid>
                  {categoryLiveMatches.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      categoryName={m.categoryName || activeCategory?.name}
                      category={activeCategory}
                      isCricket={isCricket}
                      isSetBased={isSetBased}
                      tournamentId={id}
                    />
                  ))}
                </MasonryMatchGrid>
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
                <MasonryMatchGrid dense>
                  {[...categoryCompletedMatches].reverse().map((m) => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      compact
                      categoryName={m.categoryName || activeCategory?.name}
                      category={activeCategory}
                      isCricket={isCricket}
                      isSetBased={isSetBased}
                      tournamentId={id}
                    />
                  ))}
                </MasonryMatchGrid>
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
                      {getRoundName(
                        round.number,
                        rounds.length,
                        activeCategory?.scheduleFormat,
                        round.name
                      )}
                    </span>
                    <span className="text-[9px] font-mono font-bold uppercase bg-white border border-dashed border-mustard-gold rounded-full px-3 py-1">
                      {round.matches.length} matches
                    </span>
                  </div>
                  <MasonryMatchGrid dense>
                    {round.matches.map((m) => (
                      <MatchCard
                        key={m.id}
                        match={m}
                        compact
                        categoryName={activeCategory?.name}
                        category={activeCategory}
                        isCricket={isCricket}
                        isSetBased={isSetBased}
                        tournamentId={id}
                      />
                    ))}
                  </MasonryMatchGrid>
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
                : isSetBased
                  ? "Win 3 pts · SF/SA sets · SD set difference"
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
                        <th className="py-3 px-4">
                          {isSinglesCategory(activeCategory)
                            ? "Player"
                            : isDoublesOrMixedCategory(activeCategory)
                              ? "Pair"
                              : "Team"}
                        </th>
                        <th className="py-3 px-2 text-center w-12">P</th>
                        <th className="py-3 px-2 text-center w-12">W</th>
                        {!isSetBased && (
                          <th className="py-3 px-2 text-center w-12">
                            {isCricket ? "T" : "D"}
                          </th>
                        )}
                        <th className="py-3 px-2 text-center w-12">L</th>
                        {!isCricket && !isSetBased && (
                          <th className="py-3 px-2 text-center w-12">GD</th>
                        )}
                        {isCricket && (
                          <th className="py-3 px-2 text-center w-14">RF</th>
                        )}
                        {isSetBased && (
                          <>
                            <th className="py-3 px-2 text-center w-12">SF</th>
                            <th className="py-3 px-2 text-center w-12">SA</th>
                            <th className="py-3 px-2 text-center w-12">SD</th>
                          </>
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
                          {!isSetBased && (
                            <td className="py-3 px-2 text-center">
                              {isCricket ? t.tied : t.drawn}
                            </td>
                          )}
                          <td className="py-3 px-2 text-center">{t.lost}</td>
                          {!isCricket && !isSetBased && (
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
                          {isSetBased && (
                            <>
                              <td className="py-3 px-2 text-center">{t.setsFor ?? 0}</td>
                              <td className="py-3 px-2 text-center">{t.setsAgainst ?? 0}</td>
                              <td
                                className={`py-3 px-2 text-center font-bold ${
                                  (t.setDiff ?? 0) > 0
                                    ? "text-emerald-700"
                                    : (t.setDiff ?? 0) < 0
                                      ? "text-red-500"
                                      : ""
                                }`}
                              >
                                {(t.setDiff ?? 0) > 0
                                  ? `+${t.setDiff}`
                                  : (t.setDiff ?? 0)}
                              </td>
                            </>
                          )}
                          <td className="py-3 px-4 text-center font-bold bg-[#062416]/10 text-sm border-l border-[#093c24]/20">
                            {isCricket || isSetBased ? t.points : t.pts}
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
                  <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono min-w-[420px]">
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
                  <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono min-w-[420px]">
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
                </div>
              )}
            </div>
            <div>
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
                Best fielders — {activeCategory?.name}
              </h2>
              <p className="text-[10px] font-mono text-deep-forest/45 mt-1">
                Catches, run-outs & stumpings
              </p>
              {(cricketLeaders.bestFielders || []).length === 0 ? (
                <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl py-12 text-center mt-4">
                  <p className="text-xs font-mono text-deep-forest/50">No fielding dismissals recorded yet</p>
                </div>
              ) : (
                <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl overflow-hidden shadow-sm mt-4">
                  <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono min-w-[480px]">
                    <thead>
                      <tr className="bg-[#082e1c] text-[10px] text-white uppercase font-bold">
                        <th className="py-3 px-4 w-12">#</th>
                        <th className="py-3 px-4">Player</th>
                        <th className="py-3 px-4">Club</th>
                        <th className="py-3 px-4 text-center">Field</th>
                        <th className="py-3 px-4 text-center">Awards</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#faf6ee]">
                      {cricketLeaders.bestFielders.slice(0, 20).map((p, idx) => (
                        <tr key={p.id} className="bg-[#fcf7ed]">
                          <td className="py-3 px-4 font-bold">{idx + 1}</td>
                          <td className="py-3 px-4 font-sans font-bold">{p.name}</td>
                          <td className="py-3 px-4 uppercase">{p.teamName}</td>
                          <td className="py-3 px-4 text-center font-bold">{p.dismissals}</td>
                          <td className="py-3 px-4 text-center font-bold">{p.awards}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
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
    </div>
  );
}
