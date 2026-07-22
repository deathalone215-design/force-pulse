"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ballsToOvers,
  ballsRemaining,
  inningsTotals,
  computeBatterStats,
  computeBowlerStats,
  computeCurrentRunRate,
  computeRequiredRunRate,
  computeProjectedScore,
  computePartnership,
  getCurrentOverBalls,
  ballDisplayLabel,
  ballDisplayColor,
  oversToMaxBalls,
  computeRunsTotal,
  isLegalExtra,
} from "@/lib/cricket";
import { Loader2, Undo2, Zap, Target, TrendingUp } from "lucide-react";
import {
  casErrorMessage,
  casFields,
  isCasConflict,
} from "@/lib/matchCasClient";

function playerLabel(p, short = false) {
  if (!p) return "—";
  if (short) return p.name || "—";
  return `#${p.shirtNumber ?? "–"} ${p.name}`;
}

function SelectPlayer({ label, value, onChange, players, disabledIds = [] }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/55">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-2.5 text-xs outline-none min-h-[44px]"
      >
        <option value="">Select…</option>
        {players.map((p) => (
          <option key={p.id} value={p.id} disabled={disabledIds.includes(p.id)}>
            {playerLabel(p)}
          </option>
        ))}
      </select>
    </label>
  );
}

function BallPip({ ball }) {
  const label = ballDisplayLabel(ball);
  const color = ballDisplayColor(ball);
  return (
    <span
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full border text-[10px] font-mono font-bold ${color}`}
    >
      {label}
    </span>
  );
}

function StatChip({ label, value, highlight = false }) {
  return (
    <div className={`flex flex-col items-center px-3 py-1.5 rounded-lg ${highlight ? "bg-mustard-gold/20 border border-mustard-gold/50" : "bg-white/10"}`}>
      <span className="text-[8px] font-mono uppercase tracking-widest text-white/50">{label}</span>
      <span className={`text-sm font-mono font-bold ${highlight ? "text-mustard-gold" : "text-white"}`}>{value}</span>
    </div>
  );
}

export default function CricketScorer({
  tournament,
  category,
  match,
  matchId,
  onMatchUpdate,
  onRefresh,
}) {
  const oversLimit =
    match.oversLimit || category?.oversPerInnings || tournament?.oversPerInnings || 20;

  const [busy, setBusy] = useState(false);
  const [battingTeamId, setBattingTeamId] = useState(match.battingTeamId || match.teamAId);
  const [strikerId, setStrikerId] = useState(match.strikerId || "");
  const [nonStrikerId, setNonStrikerId] = useState(match.nonStrikerId || "");
  const [bowlerId, setBowlerId] = useState(match.bowlerId || "");
  const [dismissalType, setDismissalType] = useState("BOWLED");
  const [dismissedPlayerId, setDismissedPlayerId] = useState("");
  const [fielderId, setFielderId] = useState("");
  const [extraRuns, setExtraRuns] = useState(1);
  const [wicketRuns, setWicketRuns] = useState(0);
  const [newBatsmanId, setNewBatsmanId] = useState("");
  const [newBowlerId, setNewBowlerId] = useState("");
  const [showMatchStatus, setShowMatchStatus] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [savingAward, setSavingAward] = useState(false);

  const teamA = match.teamA;
  const teamB = match.teamB;
  const activeBatId = match.status === "LIVE" && match.battingTeamId ? match.battingTeamId : battingTeamId;
  const battingTeam = activeBatId === teamA?.id ? teamA : teamB;
  const bowlingTeam = activeBatId === teamA?.id ? teamB : teamA;
  const batPlayers = battingTeam?.players || [];
  const bowlPlayers = bowlingTeam?.players || [];
  const allMatchPlayers = useMemo(
    () => [...(teamA?.players || []), ...(teamB?.players || [])],
    [teamA?.players, teamB?.players]
  );
  const needsFielder = ["CAUGHT", "RUN_OUT", "STUMPED"].includes(dismissalType);

  const allBalls = useMemo(() => match.cricketBalls || [], [match.cricketBalls]);
  const inningsBalls = useMemo(
    () => allBalls.filter((b) => b.innings === match.currentInnings),
    [allBalls, match.currentInnings]
  );

  const liveTotals = useMemo(() => {
    if (!match.battingTeamId) return null;
    return inningsTotals(match, match.battingTeamId);
  }, [match]);

  const target = match.currentInnings === 2 && match.battingTeamId
    ? (match.battingTeamId === match.teamAId ? match.scoreB : match.scoreA) + 1
    : null;

  const runsNeeded = target != null && liveTotals ? Math.max(0, target - liveTotals.runs) : null;
  const ballsLeft = liveTotals ? ballsRemaining(match, match.battingTeamId) : 0;

  const crr = liveTotals ? computeCurrentRunRate(liveTotals.runs, liveTotals.legalBalls) : "0.00";
  const rrr = runsNeeded != null ? computeRequiredRunRate(runsNeeded, ballsLeft) : null;
  const projected = match.currentInnings === 1 && liveTotals
    ? computeProjectedScore(liveTotals.runs, liveTotals.legalBalls, oversToMaxBalls(oversLimit))
    : null;

  const strikerStats = useMemo(
    () => match.strikerId ? computeBatterStats(inningsBalls, match.strikerId) : null,
    [inningsBalls, match.strikerId]
  );
  const nonStrikerStats = useMemo(
    () => match.nonStrikerId ? computeBatterStats(inningsBalls, match.nonStrikerId) : null,
    [inningsBalls, match.nonStrikerId]
  );
  const bowlerStats = useMemo(
    () => match.bowlerId ? computeBowlerStats(inningsBalls, match.bowlerId) : null,
    [inningsBalls, match.bowlerId]
  );

  const currentOverBalls = useMemo(
    () => liveTotals ? getCurrentOverBalls(allBalls, match.currentInnings, liveTotals.legalBalls) : [],
    [allBalls, match.currentInnings, liveTotals]
  );

  const partnership = useMemo(
    () => match.strikerId && match.nonStrikerId
      ? computePartnership(allBalls, match.strikerId, match.nonStrikerId, match.currentInnings)
      : { runs: 0, balls: 0 },
    [allBalls, match.strikerId, match.nonStrikerId, match.currentInnings]
  );

  const needsStart = match.status === "SCHEDULED" || (
    match.status === "LIVE" && match.currentInnings === 1 && match.inningsComplete === 0 &&
    !match.strikerId && allBalls.length === 0
  );
  const needsSecondInnings = match.status === "LIVE" && match.currentInnings === 1 && match.inningsComplete >= 1;
  const needsNewBatsman = match.status === "LIVE" && !needsSecondInnings && match.inningsComplete < 2 && !match.strikerId && !!match.nonStrikerId;
  const needsNewBowler = match.status === "LIVE" && !needsSecondInnings && !needsNewBatsman && !!match.strikerId && !match.bowlerId;

  const dismissedIds = useMemo(() => {
    const s = new Set();
    allBalls.filter((b) => b.innings === match.currentInnings && b.isWicket).forEach((b) => { if (b.dismissedPlayerId) s.add(b.dismissedPlayerId); });
    return s;
  }, [allBalls, match.currentInnings]);

  const availableBatters = batPlayers.filter((p) => !dismissedIds.has(p.id));

  useEffect(() => {
    if (needsSecondInnings || needsStart) { setStrikerId(""); setNonStrikerId(""); setBowlerId(""); }
  }, [needsSecondInnings, needsStart, match.inningsComplete]);

  const api = async (url, options) => {
    setBusy(true);
    try {
      let body = options.body;
      if (body && typeof body === "string") {
        try {
          body = JSON.stringify({
            ...JSON.parse(body),
            ...casFields(match, matchId),
          });
        } catch {
          body = options.body;
        }
      } else if (options.method === "DELETE") {
        body = JSON.stringify(casFields(match, matchId));
      }
      const res = await fetch(url, {
        ...options,
        body,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (isCasConflict(res, data) && data?.match && onMatchUpdate) {
          onMatchUpdate(data.match);
        }
        throw new Error(casErrorMessage(res, data, "Request failed"));
      }
      if (data.match && onMatchUpdate) {
        onMatchUpdate(data.match);
      } else if (onRefresh) {
        await onRefresh();
      }
      return data;
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    if (!battingTeamId || !strikerId || !nonStrikerId || !bowlerId) { alert("Pick batting side, two openers, and opening bowler"); return; }
    try { await api(`/api/matches/${matchId}/cricket/start`, { method: "POST", body: JSON.stringify({ battingTeamId, strikerId, nonStrikerId, bowlerId }) }); }
    catch (err) { alert(err.message); }
  };

  const handleStartSecond = async () => {
    if (!strikerId || !nonStrikerId || !bowlerId) { alert("Pick chase openers and opening bowler"); return; }
    try { await api(`/api/matches/${matchId}/cricket/innings`, { method: "POST", body: JSON.stringify({ strikerId, nonStrikerId, bowlerId }) }); }
    catch (err) { alert(err.message); }
  };

  const setPlayers = async (payload) => {
    try { await api(`/api/matches/${matchId}/cricket/players`, { method: "PATCH", body: JSON.stringify(payload) }); setNewBatsmanId(""); setNewBowlerId(""); }
    catch (err) { alert(err.message); }
  };

  const scoreBall = async (payload) => {
    if (needsNewBatsman || needsNewBowler || needsSecondInnings || needsStart) {
      alert("Finish setup first");
      return;
    }
    // Instant score bump — server response reconciles full ball log
    if (onMatchUpdate && match.battingTeamId) {
      const isA = match.battingTeamId === match.teamAId;
      const runs = computeRunsTotal(payload);
      const legal = isLegalExtra(payload.extraType);
      const isWicket = !!payload.isWicket;
      const patch = isA
        ? {
            scoreA: (match.scoreA || 0) + runs,
            wicketsA: (match.wicketsA || 0) + (isWicket ? 1 : 0),
            ballsFacedA: (match.ballsFacedA || 0) + (legal ? 1 : 0),
          }
        : {
            scoreB: (match.scoreB || 0) + runs,
            wicketsB: (match.wicketsB || 0) + (isWicket ? 1 : 0),
            ballsFacedB: (match.ballsFacedB || 0) + (legal ? 1 : 0),
          };
      if (isWicket && !payload.newStrikerId) {
        patch.strikerId = null;
      }
      onMatchUpdate(patch);
    }
    try {
      await api(`/api/matches/${matchId}/cricket/ball`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      alert(err.message);
      if (onRefresh) await onRefresh();
    }
  };

  const undoLast = async () => {
    try { await api(`/api/matches/${matchId}/cricket/ball`, { method: "DELETE" }); }
    catch (err) { alert(err.message); }
  };

  const saveAward = async (fields) => {
    setSavingAward(true);
    try {
      const res = await fetch(`/api/matches/${matchId}/awards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...fields, ...casFields(match, matchId) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (isCasConflict(res, data) && data?.id && onMatchUpdate) {
          onMatchUpdate(data);
        }
        throw new Error(casErrorMessage(res, data, "Failed to save award"));
      }
      if (onMatchUpdate) onMatchUpdate(data);
      else if (onRefresh) await onRefresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingAward(false);
    }
  };

  const updateStatus = async (s) => {
    setUpdatingStatus(true);
    try {
      if (onMatchUpdate) onMatchUpdate({ status: s });
      const res = await fetch(`/api/matches/${matchId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: s, ...casFields(match, matchId) }),
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (isCasConflict(res, data) && data?.match && onMatchUpdate) {
          onMatchUpdate(data.match);
        }
        throw new Error(casErrorMessage(res, data, "Failed to update status"));
      }
      if (data?.status && onMatchUpdate) {
        onMatchUpdate({
          status: data.status,
          version: data.version,
          updatedAt: data.updatedAt,
        });
      }
    } catch (err) {
      alert(err.message);
      if (onRefresh) await onRefresh();
    } finally {
      setUpdatingStatus(false);
      setShowMatchStatus(false);
    }
  };

  const strikerPlayer = batPlayers.find((p) => p.id === match.strikerId);
  const nonStrikerPlayer = batPlayers.find((p) => p.id === match.nonStrikerId);
  const bowlerPlayer = bowlPlayers.find((p) => p.id === match.bowlerId);

  return (
    <div className="space-y-4">

      {/* ── MAIN SCOREBOARD ── */}
      <section className="bg-[#0d472c] border-2 border-mustard-gold rounded-2xl shadow-lg text-white overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-[#093c24]">
          <div>
            <p className="text-[9px] font-mono text-mustard-gold uppercase font-bold tracking-widest">
              🏏 Cricket · {oversLimit} overs · Innings {match.currentInnings || 1}
            </p>
            <p className="text-[10px] font-mono text-white/50 mt-0.5">{tournament.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {match.status === "LIVE" && allBalls.length > 0 && (
              <button type="button" disabled={busy} onClick={undoLast}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/20 text-[9px] font-mono font-bold uppercase cursor-pointer hover:bg-white/10 disabled:opacity-50">
                <Undo2 className="w-3 h-3" /> Undo
              </button>
            )}
            <button type="button" onClick={() => setShowMatchStatus((v) => !v)}
              className="px-2.5 py-1.5 rounded-lg border border-white/20 text-[9px] font-mono font-bold uppercase cursor-pointer hover:bg-white/10">
              {match.status}
            </button>
          </div>
        </div>

        {showMatchStatus && (
          <div className="px-4 py-2 bg-[#082e1c] flex gap-2">
            {["SCHEDULED", "LIVE", "COMPLETED"].map((s) => (
              <button key={s} type="button" onClick={() => updateStatus(s)} disabled={updatingStatus}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase cursor-pointer ${match.status === s ? "bg-mustard-gold text-deep-forest" : "border border-white/20 text-white/70 hover:bg-white/10"}`}>
                {s}
              </button>
            ))}
            {updatingStatus && <Loader2 className="w-4 h-4 animate-spin text-mustard-gold" />}
          </div>
        )}

        {/* Score display */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
          {[teamA, teamB].map((team) => {
            if (!team) return null;
            const tot = inningsTotals(match, team.id);
            const batting = match.battingTeamId === team.id || (!match.battingTeamId && battingTeamId === team.id);
            return (
              <div key={team.id} className={`rounded-xl border p-4 ${batting ? "border-mustard-gold bg-[#093c24]" : "border-white/10 bg-[#082e1c]/60"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[8px] font-mono uppercase text-white/40 font-bold tracking-widest">
                      {batting ? (match.currentInnings === 2 ? "Chasing" : "Batting") : "Bowling"}
                    </p>
                    <p className="font-display uppercase text-base tracking-wide mt-0.5 truncate">{team.name}</p>
                  </div>
                  {team.logoUrl && <img src={team.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-white/20" />}
                </div>
                <p className="text-4xl font-mono font-bold text-mustard-gold mt-2 tabular-nums">
                  {tot.runs}/{tot.wickets}
                </p>
                <p className="text-[10px] font-mono text-white/50 mt-1">
                  {ballsToOvers(tot.legalBalls)}/{oversLimit} ov
                </p>
                {batting && match.status === "LIVE" && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <StatChip label="CRR" value={crr} />
                    {rrr && <StatChip label="RRR" value={rrr} highlight />}
                    {projected && !rrr && <StatChip label="Proj." value={`~${projected}`} />}
                    {target && <StatChip label="Target" value={target} />}
                    {runsNeeded != null && <StatChip label="Need" value={`${runsNeeded} (${ballsLeft}b)`} highlight />}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Current over + partnership */}
        {match.status === "LIVE" && match.strikerId && currentOverBalls.length > 0 && (
          <div className="px-4 pb-4">
            <div className="bg-[#082e1c] rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[8px] font-mono text-white/40 uppercase tracking-widest font-bold">
                  This over · {ballsToOvers(liveTotals?.legalBalls || 0)}/{oversLimit}
                </p>
                <p className="text-[8px] font-mono text-white/40 uppercase tracking-widest">
                  Partnership: {partnership.runs}({partnership.balls})
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {currentOverBalls.map((b, i) => <BallPip key={b.id || i} ball={b} />)}
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-dashed border-white/20 text-[10px] font-mono text-white/30">·</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── BATTER + BOWLER CARDS ── */}
      {match.status === "LIVE" && match.strikerId && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Batters */}
          <section className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-4 space-y-2 shadow-sm">
            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/50">Batting</p>
            {[{ id: match.strikerId, p: strikerPlayer, stats: strikerStats, striker: true },
              { id: match.nonStrikerId, p: nonStrikerPlayer, stats: nonStrikerStats, striker: false }]
              .filter((x) => x.id)
              .map(({ p, stats, striker }) => (
                <div key={p?.id || Math.random()} className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${striker ? "bg-[#0d472c] text-white" : "bg-[#fcf7ed] text-deep-forest"}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[9px] font-mono font-bold ${striker ? "text-mustard-gold" : "text-deep-forest/40"}`}>
                      {striker ? "⚡" : ""}#{p?.shirtNumber ?? "–"}
                    </span>
                    <span className={`text-xs font-bold uppercase truncate ${striker ? "text-white" : "text-deep-forest"}`}>
                      {p?.name || "—"}{striker ? "*" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <span className={`text-sm font-mono font-bold tabular-nums ${striker ? "text-mustard-gold" : "text-deep-forest"}`}>
                      {stats?.runs ?? 0}({stats?.ballsFaced ?? 0})
                    </span>
                    <div className="text-[9px] font-mono text-right leading-tight">
                      <div className={striker ? "text-white/60" : "text-deep-forest/50"}>SR {stats?.sr ?? "—"}</div>
                      <div className={striker ? "text-white/50" : "text-deep-forest/40"}>4s:{stats?.fours ?? 0} 6s:{stats?.sixes ?? 0}</div>
                    </div>
                  </div>
                </div>
              ))}
          </section>

          {/* Bowler */}
          <section className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-4 space-y-2 shadow-sm">
            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/50">Bowling</p>
            {bowlerPlayer && bowlerStats && (
              <div className="bg-[#0d472c] text-white rounded-xl px-3 py-2.5 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[9px] font-mono text-mustard-gold uppercase font-bold">Current bowler</p>
                  <p className="text-xs font-bold uppercase truncate mt-0.5">#{bowlerPlayer.shirtNumber} {bowlerPlayer.name}</p>
                  <p className="text-[9px] font-mono text-white/60 mt-1">
                    {bowlerStats.oversStr} ov · {bowlerStats.runs} runs · {bowlerStats.wickets}W
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[8px] font-mono text-white/40 uppercase">Econ</p>
                  <p className="text-lg font-mono font-bold text-mustard-gold">{bowlerStats.economy}</p>
                  {bowlerStats.maidens > 0 && <p className="text-[9px] font-mono text-white/40">{bowlerStats.maidens}M</p>}
                </div>
              </div>
            )}
            {!bowlerPlayer && (
              <div className="rounded-xl bg-slate-50 border border-dashed border-slate-200 px-3 py-4 text-center">
                <p className="text-[10px] font-mono text-slate-400">Waiting for bowler</p>
              </div>
            )}

            {/* First innings score for reference in 2nd innings */}
            {match.currentInnings === 2 && target && (
              <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-mustard-gold/10 border border-mustard-gold/30">
                <Target className="w-3.5 h-3.5 text-mustard-gold shrink-0" />
                <p className="text-[10px] font-mono text-deep-forest font-bold">
                  Target: {target} · Need {runsNeeded} from {ballsLeft} balls
                </p>
              </div>
            )}
            {match.currentInnings === 1 && projected && (
              <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-blue-50 border border-blue-200">
                <TrendingUp className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <p className="text-[10px] font-mono text-blue-800 font-bold">Projected: ~{projected}</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── SETUP: START / SECOND INNINGS ── */}
      {(needsStart || needsSecondInnings) && (
        <section className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest">
            {needsSecondInnings ? "🏏 Start second innings (chase)" : "🏏 Start match — select lineup"}
          </h3>

          {needsStart && (
            <div className="space-y-2">
              <p className="text-[9px] font-mono font-bold uppercase text-deep-forest/55">Who bats first?</p>
              <div className="grid grid-cols-2 gap-2">
                {[teamA, teamB].map((t) => t && (
                  <button key={t.id} type="button"
                    onClick={() => { setBattingTeamId(t.id); setStrikerId(""); setNonStrikerId(""); setBowlerId(""); }}
                    className={`py-3 rounded-xl text-[10px] font-mono font-bold uppercase border cursor-pointer ${battingTeamId === t.id ? "bg-mustard-gold border-mustard-gold text-deep-forest" : "bg-cream-bg border-slate-200 text-deep-forest/70 hover:border-mustard-gold/50"}`}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {needsSecondInnings && (
            <div className="p-3 rounded-xl bg-mustard-gold/10 border border-mustard-gold/40">
              <p className="text-xs font-mono text-deep-forest font-bold">
                Target: {(match.battingTeamId === teamA?.id ? match.scoreA : match.scoreB) + 1}
              </p>
              <p className="text-[10px] font-mono text-deep-forest/60 mt-0.5">
                Chasing: {match.battingTeamId === teamA?.id ? teamB?.name : teamA?.name}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SelectPlayer label="Striker" value={strikerId} onChange={setStrikerId}
              players={needsSecondInnings ? (match.battingTeamId === teamA?.id ? teamB : teamA)?.players || [] : batPlayers}
              disabledIds={[nonStrikerId].filter(Boolean)} />
            <SelectPlayer label="Non-striker" value={nonStrikerId} onChange={setNonStrikerId}
              players={needsSecondInnings ? (match.battingTeamId === teamA?.id ? teamB : teamA)?.players || [] : batPlayers}
              disabledIds={[strikerId].filter(Boolean)} />
            <SelectPlayer label="Opening bowler" value={bowlerId} onChange={setBowlerId}
              players={needsSecondInnings ? (match.battingTeamId === teamA?.id ? teamA : teamB)?.players || [] : bowlPlayers} />
          </div>

          <button type="button" disabled={busy} onClick={needsSecondInnings ? handleStartSecond : handleStart}
            className="w-full py-3.5 bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest rounded-xl text-xs font-mono font-bold uppercase cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {needsSecondInnings ? "Begin chase" : "Start innings"}
          </button>
        </section>
      )}

      {/* ── NEW BATSMAN ── */}
      {needsNewBatsman && (
        <section className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-red-700">
            🔴 Wicket — send in next batsman
          </h3>
          <SelectPlayer label="New batsman (striker)" value={newBatsmanId} onChange={setNewBatsmanId}
            players={availableBatters.filter((p) => p.id !== match.nonStrikerId)} />
          <button type="button" disabled={busy || !newBatsmanId}
            onClick={() => setPlayers({ strikerId: newBatsmanId, nonStrikerId: match.nonStrikerId })}
            className="w-full py-3 bg-[#0d472c] text-white rounded-xl text-xs font-mono font-bold uppercase cursor-pointer disabled:opacity-50">
            Confirm batsman
          </button>
        </section>
      )}

      {/* ── NEW BOWLER ── */}
      {needsNewBowler && (
        <section className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-blue-800">
            Over complete — select next bowler
          </h3>
          <SelectPlayer label="Bowler" value={newBowlerId} onChange={setNewBowlerId} players={bowlPlayers} />
          <button type="button" disabled={busy || !newBowlerId}
            onClick={() => setPlayers({ bowlerId: newBowlerId })}
            className="w-full py-3 bg-[#0d472c] text-white rounded-xl text-xs font-mono font-bold uppercase cursor-pointer disabled:opacity-50">
            Confirm bowler
          </button>
        </section>
      )}

      {/* ── SCORING PAD ── */}
      {match.status === "LIVE" && !needsStart && !needsSecondInnings && !needsNewBatsman && !needsNewBowler && match.strikerId && match.bowlerId && (
        <section className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-4 sm:p-5 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/50">Scoring Pad</h3>
            {busy && <Loader2 className="w-4 h-4 animate-spin text-mustard-gold" />}
          </div>

          {/* Runs off bat */}
          <div>
            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/50 mb-2">Runs off bat</p>
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" disabled={busy}
                  onClick={() => scoreBall({ runsOffBat: n, extras: 0, extraType: null })}
                  className={`py-4 rounded-xl border font-mono font-bold text-xl cursor-pointer disabled:opacity-50 transition-all min-h-[56px]
                    ${n === 4 ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                      : n === 6 ? "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                      : n === 0 ? "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                      : "bg-cream-bg border-slate-200 text-deep-forest hover:border-mustard-gold hover:bg-mustard-gold"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Extras + Wicket */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Extras */}
            <div className="space-y-3">
              <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/50">Extras</p>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-mono text-deep-forest/60 shrink-0">Runs:</label>
                <input type="number" min={1} max={9} value={extraRuns} onChange={(e) => setExtraRuns(e.target.value)}
                  className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[{ t: "WD", label: "Wide" }, { t: "NB", label: "No-ball" }, { t: "BYE", label: "Bye" }, { t: "LB", label: "Leg-bye" }].map((x) => (
                  <button key={x.t} type="button" disabled={busy}
                    onClick={() => scoreBall({ runsOffBat: 0, extras: parseInt(extraRuns, 10) || 1, extraType: x.t })}
                    className="py-2.5 rounded-xl border border-slate-200 bg-yellow-50 text-[10px] font-mono font-bold uppercase cursor-pointer hover:border-mustard-gold hover:bg-mustard-gold/10 disabled:opacity-50">
                    {x.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Wicket */}
            <div className="space-y-3">
              <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/50">Wicket</p>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-mono text-deep-forest/60 shrink-0">Runs on wkt:</label>
                <input type="number" min={0} max={6} value={wicketRuns} onChange={(e) => setWicketRuns(Number(e.target.value))}
                  className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center font-mono" />
              </div>
              <select value={dismissalType} onChange={(e) => setDismissalType(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none">
                {["BOWLED", "CAUGHT", "LBW", "RUN_OUT", "STUMPED", "HIT_WICKET", "OBSTRUCTING", "OTHER"].map((d) => (
                  <option key={d} value={d}>{d.replace(/_/g, " ")}</option>
                ))}
              </select>
              <select value={dismissedPlayerId} onChange={(e) => setDismissedPlayerId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none">
                <option value="">Dismissed — (default: striker)</option>
                {[match.strikerId, match.nonStrikerId].filter(Boolean).map((id) => {
                  const p = batPlayers.find((x) => x.id === id);
                  return <option key={id} value={id}>{playerLabel(p)}</option>;
                })}
              </select>
              {needsFielder && (
                <select
                  value={fielderId}
                  onChange={(e) => setFielderId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none"
                >
                  <option value="">Fielder (catch / run-out / stump)</option>
                  {bowlPlayers.map((p) => (
                    <option key={p.id} value={p.id}>{playerLabel(p)}</option>
                  ))}
                </select>
              )}
              <button type="button" disabled={busy || (needsFielder && !fielderId)}
                onClick={() => scoreBall({
                  runsOffBat: wicketRuns,
                  extras: 0,
                  extraType: null,
                  isWicket: true,
                  dismissalType,
                  dismissedPlayerId: dismissedPlayerId || match.strikerId,
                  fielderId: needsFielder ? fielderId || null : null,
                })}
                className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[10px] font-mono font-bold uppercase cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                <Zap className="w-3.5 h-3.5" /> Record wicket
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── MATCH COMPLETE + AWARDS ── */}
      {match.status === "COMPLETED" && (
        <section className="bg-white border-2 border-mustard-gold rounded-2xl p-5 space-y-5">
          <div className="text-center">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-deep-forest/50 mb-2">Match complete</p>
            <p className="text-xl font-display uppercase text-deep-forest">
              {match.scoreA === match.scoreB ? "Tied" : match.scoreA > match.scoreB ? `${teamA?.name} won` : `${teamB?.name} won`}
            </p>
            <p className="text-xs font-mono text-deep-forest/60 mt-2">
              {teamA?.name} {match.scoreA}/{match.wicketsA} ({ballsToOvers(match.ballsFacedA)})
              &nbsp;vs&nbsp;
              {teamB?.name} {match.scoreB}/{match.wicketsB} ({ballsToOvers(match.ballsFacedB)})
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-dashed border-mustard-gold/50 pt-4">
            <label className="block space-y-1.5 text-left">
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/55">
                Man of the Match
              </span>
              <select
                value={match.manOfTheMatchId || ""}
                disabled={savingAward}
                onChange={(e) => saveAward({ manOfTheMatchId: e.target.value || null })}
                className="w-full bg-cream-bg border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-2.5 text-xs outline-none min-h-[44px] disabled:opacity-60"
              >
                <option value="">Select player…</option>
                {allMatchPlayers.map((p) => (
                  <option key={p.id} value={p.id}>{playerLabel(p)} · {p.teamId === teamA?.id ? teamA?.name : teamB?.name}</option>
                ))}
              </select>
              {match.manOfTheMatch && (
                <p className="text-[10px] font-mono text-mustard-gold font-bold">
                  ★ {match.manOfTheMatch.name}
                </p>
              )}
            </label>

            <label className="block space-y-1.5 text-left">
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/55">
                Best Fielder
              </span>
              <select
                value={match.bestFielderId || ""}
                disabled={savingAward}
                onChange={(e) => saveAward({ bestFielderId: e.target.value || null })}
                className="w-full bg-cream-bg border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-2.5 text-xs outline-none min-h-[44px] disabled:opacity-60"
              >
                <option value="">Select player…</option>
                {allMatchPlayers.map((p) => (
                  <option key={p.id} value={p.id}>{playerLabel(p)} · {p.teamId === teamA?.id ? teamA?.name : teamB?.name}</option>
                ))}
              </select>
              {match.bestFielder && (
                <p className="text-[10px] font-mono text-mustard-gold font-bold">
                  ★ {match.bestFielder.name}
                </p>
              )}
            </label>
          </div>
          {savingAward && (
            <div className="flex justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-mustard-gold" />
            </div>
          )}
        </section>
      )}

      {/* ── BALL-BY-BALL LOG ── */}
      {allBalls.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <h4 className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/50">Ball log — recent 18</h4>
          <div className="flex flex-wrap gap-1.5">
            {[...allBalls].slice(-18).reverse().map((b, i) => (
              <div key={b.id || i} className="flex items-center gap-1">
                {i > 0 && allBalls[allBalls.length - i].overNumber !== allBalls[allBalls.length - i - 1]?.overNumber && (
                  <span className="w-px h-6 bg-slate-200 mx-1" />
                )}
                <BallPip ball={b} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
