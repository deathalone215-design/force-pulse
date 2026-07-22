"use client";

import { useState, useCallback } from "react";
import { Loader2, Undo2, CheckCircle2 } from "lucide-react";
import { getConfig, getSetTarget, getSetWinner } from "@/lib/setBasedSports";
import {
  casErrorMessage,
  casFields,
  isCasConflict,
} from "@/lib/matchCasClient";
import { resolveTeamLogo } from "@/lib/teamLogo";

function TeamCrest({ team, category = null, size = "lg" }) {
  const sizeClass =
    size === "lg"
      ? "w-14 h-14 sm:w-20 sm:h-20 text-base sm:text-xl"
      : "w-10 h-10 text-sm";

  const getGradient = (name) => {
    if (!name) return "linear-gradient(135deg, #334155, #0f172a)";
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const c1 = Math.abs(hash % 360);
    const c2 = (c1 + 130) % 360;
    return `linear-gradient(135deg, hsl(${c1}, 60%, 45%), hsl(${c2}, 60%, 30%))`;
  };

  const logo = resolveTeamLogo(team, category);

  if (logo) {
    return (
      <img
        src={logo}
        alt={team?.name}
        className={`${sizeClass} rounded-full object-cover border-2 border-white/30 shadow-lg`}
      />
    );
  }
  return (
    <div
      style={{ background: getGradient(team?.name) }}
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold text-white uppercase select-none border-2 border-white/30 shadow-lg`}
    >
      {(team?.name || "??").slice(0, 2)}
    </div>
  );
}

export default function SetBasedScorer({
  tournament,
  category,
  match,
  matchId,
  onMatchUpdate,
  onRefresh,
}) {
  const [loading, setLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const sport = category?.sport || tournament?.sport;
  const config = getConfig(sport, category);
  if (!config) return null;

  const sets = match.matchSets || [];
  const currentSetNum = match.currentSet || 1;
  const currentSet = sets.find((s) => s.setNumber === currentSetNum) || {
    setNumber: currentSetNum,
    scoreA: 0,
    scoreB: 0,
    winnerId: null,
  };

  const setsWonA = match.scoreA || 0;
  const setsWonB = match.scoreB || 0;
  const isCompleted = match.status === "COMPLETED";

  const target = getSetTarget(currentSetNum, config);
  const setWinner = getSetWinner(currentSet.scoreA, currentSet.scoreB, currentSetNum, config);
  const canUndoPrevSet =
    currentSetNum > 1 &&
    currentSet.scoreA === 0 &&
    currentSet.scoreB === 0;
  const canUndoA =
    !isCompleted
      ? currentSet.scoreA > 0 || canUndoPrevSet || !!currentSet.winnerId
      : (currentSet.scoreA > 0 || !!currentSet.winnerId) && setsWonA + setsWonB > 0;
  const canUndoB =
    !isCompleted
      ? currentSet.scoreB > 0 || canUndoPrevSet || !!currentSet.winnerId
      : (currentSet.scoreB > 0 || !!currentSet.winnerId) && setsWonA + setsWonB > 0;

  const applyResponse = useCallback(
    (data) => {
      if (data?.match && onMatchUpdate) {
        onMatchUpdate({
          ...data.match,
          matchSets: data.sets || data.match.matchSets,
        });
      } else if (onRefresh) {
        return onRefresh();
      }
    },
    [onMatchUpdate, onRefresh]
  );

  /** Instant UI before the API returns — rally points must feel live. */
  const optimisticPoint = useCallback(
    (team, delta) => {
      if (!onMatchUpdate) return;
      const setNum = match.currentSet || 1;
      const existing = (match.matchSets || []).find((s) => s.setNumber === setNum);
      const scoreA =
        (existing?.scoreA ?? 0) + (team === "A" ? delta : 0);
      const scoreB =
        (existing?.scoreB ?? 0) + (team === "B" ? delta : 0);
      if (scoreA < 0 || scoreB < 0) return;
      const nextSet = {
        ...(existing || { setNumber: setNum, winnerId: null }),
        setNumber: setNum,
        scoreA,
        scoreB,
      };
      const rest = (match.matchSets || []).filter((s) => s.setNumber !== setNum);
      onMatchUpdate({
        matchSets: [...rest, nextSet].sort((a, b) => a.setNumber - b.setNumber),
      });
    },
    [match, onMatchUpdate]
  );

  const addPoint = useCallback(
    async (team) => {
      if (loading || isCompleted) return;
      setLoading(true);
      optimisticPoint(team, 1);
      try {
        const res = await fetch(`/api/matches/${matchId}/set-point`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ team, ...casFields(match, matchId) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (isCasConflict(res, data) && data?.match && onMatchUpdate) {
            onMatchUpdate({
              ...data.match,
              matchSets: data.sets || data.match.matchSets,
            });
          } else if (onRefresh) {
            await onRefresh();
          }
          alert(casErrorMessage(res, data, "Failed to add point"));
          return;
        }
        await applyResponse(data);
      } finally {
        setLoading(false);
      }
    },
    [
      loading,
      isCompleted,
      matchId,
      match,
      applyResponse,
      onMatchUpdate,
      onRefresh,
      optimisticPoint,
    ]
  );

  const undoPoint = useCallback(
    async (team) => {
      if (loading) return;
      setLoading(true);
      // Only optimism when undoing within the current set (not previous-game undo)
      if (
        (team === "A" && currentSet.scoreA > 0) ||
        (team === "B" && currentSet.scoreB > 0)
      ) {
        optimisticPoint(team, -1);
      }
      try {
        const res = await fetch(`/api/matches/${matchId}/set-point?team=${team}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(casFields(match, matchId)),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (isCasConflict(res, data) && data?.match && onMatchUpdate) {
            onMatchUpdate({
              ...data.match,
              matchSets: data.sets || data.match.matchSets,
            });
          } else if (onRefresh) {
            await onRefresh();
          }
          alert(casErrorMessage(res, data, "Failed to undo"));
          return;
        }
        await applyResponse(data);
      } finally {
        setLoading(false);
      }
    },
    [
      loading,
      matchId,
      match,
      applyResponse,
      onMatchUpdate,
      onRefresh,
      optimisticPoint,
      currentSet.scoreA,
      currentSet.scoreB,
    ]
  );

  const updateStatus = async (newStatus) => {
    setUpdatingStatus(true);
    try {
      if (onMatchUpdate) onMatchUpdate({ status: newStatus });
      const res = await fetch(`/api/matches/${matchId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          ...casFields(match, matchId),
        }),
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
    }
  };

  const completedSets = sets.filter((s) => s.winnerId);

  return (
    <div className="space-y-5">
      {/* Match state control */}
      <section className="bg-[#0d472c] border-2 border-mustard-gold rounded-2xl p-4 sm:p-6 shadow-lg text-white">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5 border-b border-[#093c24] pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-mustard-gold uppercase font-bold">
              Match State:
            </span>
            <select
              value={match.status}
              disabled={updatingStatus}
              onChange={(e) => updateStatus(e.target.value)}
              className="bg-[#093c24] border border-white/25 text-[10px] font-mono text-white rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-mustard-gold outline-none cursor-pointer disabled:opacity-60 min-h-[40px]"
            >
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="LIVE">LIVE</option>
              <option value="COMPLETED">COMPLETED</option>
            </select>
            {updatingStatus && <Loader2 className="w-3.5 h-3.5 animate-spin text-mustard-gold" />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/50 uppercase">
              {config.icon} {config.name}
            </span>
            {match.status === "LIVE" && (
              <span className="text-[10px] text-red-400 font-mono font-bold animate-pulse flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                LIVE
              </span>
            )}
          </div>
        </div>

        {/* Hero = current game/set points (what +1 updates). Games/sets won are secondary. */}
        <div className="grid grid-cols-3 items-center gap-2 sm:gap-6 text-center mb-4">
          <div className="flex flex-col items-center gap-2">
            <TeamCrest team={match.teamA} category={category} />
            <h2 className="text-[10px] sm:text-sm font-bold uppercase tracking-wider leading-tight line-clamp-2">
              {match.teamA?.name}
            </h2>
          </div>
          <div className="flex flex-col items-center gap-1">
            {isCompleted ? (
              <>
                <div className="flex items-center gap-2 sm:gap-4">
                  <span className="text-3xl sm:text-5xl font-mono font-bold text-white bg-[#0a331f] border border-black/40 px-3 sm:px-5 py-2 sm:py-3 rounded-xl min-w-[48px] sm:min-w-[68px] shadow-inner tabular-nums text-center">
                    {setsWonA}
                  </span>
                  <span className="text-slate-400 font-bold text-xl sm:text-3xl font-mono">:</span>
                  <span className="text-3xl sm:text-5xl font-mono font-bold text-white bg-[#0a331f] border border-black/40 px-3 sm:px-5 py-2 sm:py-3 rounded-xl min-w-[48px] sm:min-w-[68px] shadow-inner tabular-nums text-center">
                    {setsWonB}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">
                  {sport === "BADMINTON" ? "games won" : "sets won"}
                </span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 sm:gap-4">
                  <span className="text-3xl sm:text-5xl font-mono font-bold text-mustard-gold bg-[#0a331f] border border-black/40 px-3 sm:px-5 py-2 sm:py-3 rounded-xl min-w-[48px] sm:min-w-[68px] shadow-inner tabular-nums text-center">
                    {currentSet.scoreA}
                  </span>
                  <span className="text-slate-400 font-bold text-xl sm:text-3xl font-mono">:</span>
                  <span className="text-3xl sm:text-5xl font-mono font-bold text-mustard-gold bg-[#0a331f] border border-black/40 px-3 sm:px-5 py-2 sm:py-3 rounded-xl min-w-[48px] sm:min-w-[68px] shadow-inner tabular-nums text-center">
                    {currentSet.scoreB}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">
                  {sport === "BADMINTON" ? "game" : "set"} {currentSetNum} · to {target}
                </span>
                <p className="text-[10px] font-mono text-white/55 mt-1">
                  {sport === "BADMINTON" ? "Games" : "Sets"}{" "}
                  <span className="font-bold text-white">{setsWonA}–{setsWonB}</span>
                </p>
              </>
            )}
          </div>
          <div className="flex flex-col items-center gap-2">
            <TeamCrest team={match.teamB} category={category} />
            <h2 className="text-[10px] sm:text-sm font-bold uppercase tracking-wider leading-tight line-clamp-2">
              {match.teamB?.name}
            </h2>
          </div>
        </div>

        {/* Completed sets history */}
        {completedSets.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center border-t border-[#093c24] pt-4">
            {completedSets.map((s) => (
              <div
                key={s.id || s.setNumber}
                className="flex items-center gap-2 text-[10px] font-mono bg-[#0a331f] rounded-lg px-3 py-1.5"
              >
                <span className="text-white/40">
                  {sport === "BADMINTON" ? "Game" : "Set"} {s.setNumber}
                </span>
                <span
                  className={`font-bold ${s.winnerId === match.teamAId ? "text-mustard-gold" : "text-white/60"}`}
                >
                  {s.scoreA}
                </span>
                <span className="text-white/30">-</span>
                <span
                  className={`font-bold ${s.winnerId === match.teamBId ? "text-mustard-gold" : "text-white/60"}`}
                >
                  {s.scoreB}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Current set / game scorer (kept after complete so Undo still works) */}
      <section className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-4 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0a331f]/70">
              {sport === "BADMINTON" ? "Game" : "Set"} {currentSetNum} · First to{" "}
              <span className="text-[#0d472c]">{target}</span>
              {config.winByTwo ? " (win by 2)" : ""}
              {config.pointCap ? ` · cap ${config.pointCap}` : ""}
            </h3>
            {(setWinner || isCompleted) && (
              <span className="text-[10px] font-mono text-mustard-gold font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />{" "}
                {isCompleted
                  ? "Match complete"
                  : sport === "BADMINTON"
                    ? "Game won"
                    : "Set won"}
              </span>
            )}
          </div>

          {sport === "BADMINTON" && (
            <p className="text-[10px] font-mono text-deep-forest/50 mb-4 text-center">
              Badminton rally scoring · to 21 · must win by 2 · hard cap 30
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Team A */}
            <div className="flex flex-col items-center gap-3">
              <TeamCrest team={match.teamA} category={category} size="md" />
              <span className="text-xs font-mono font-bold uppercase text-deep-forest text-center line-clamp-2">
                {match.teamA?.name}
              </span>
              <span className="text-5xl sm:text-7xl font-mono font-bold text-[#0d472c] tabular-nums">
                {currentSet.scoreA}
              </span>
              <div className="flex gap-2 w-full max-w-[200px]">
                <button
                  type="button"
                  onClick={() => addPoint("A")}
                  disabled={loading || !!setWinner || isCompleted}
                  className="flex-1 bg-[#0d472c] hover:bg-[#0a3320] text-white font-bold text-2xl rounded-xl py-4 px-4 transition-all disabled:opacity-40 cursor-pointer min-h-[56px]"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => undoPoint("A")}
                  disabled={loading || !canUndoA}
                  className="inline-flex items-center gap-1 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10px] font-mono font-bold uppercase disabled:opacity-30 cursor-pointer min-h-[56px]"
                  title="Undo point"
                >
                  <Undo2 className="w-4 h-4" />
                  Undo
                </button>
              </div>
            </div>

            {/* Team B */}
            <div className="flex flex-col items-center gap-3">
              <TeamCrest team={match.teamB} category={category} size="md" />
              <span className="text-xs font-mono font-bold uppercase text-deep-forest text-center line-clamp-2">
                {match.teamB?.name}
              </span>
              <span className="text-5xl sm:text-7xl font-mono font-bold text-[#0d472c] tabular-nums">
                {currentSet.scoreB}
              </span>
              <div className="flex gap-2 w-full max-w-[200px]">
                <button
                  type="button"
                  onClick={() => undoPoint("B")}
                  disabled={loading || !canUndoB}
                  className="inline-flex items-center gap-1 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10px] font-mono font-bold uppercase disabled:opacity-30 cursor-pointer min-h-[56px]"
                  title="Undo point"
                >
                  <Undo2 className="w-4 h-4" />
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() => addPoint("B")}
                  disabled={loading || !!setWinner || isCompleted}
                  className="flex-1 bg-[#0d472c] hover:bg-[#0a3320] text-white font-bold text-2xl rounded-xl py-4 px-4 transition-all disabled:opacity-40 cursor-pointer min-h-[56px]"
                >
                  +1
                </button>
              </div>
            </div>
          </div>

          {canUndoPrevSet && (
            <p className="mt-3 text-[10px] font-mono text-deep-forest/45 text-center">
              Undo reverses the previous {sport === "BADMINTON" ? "game" : "set"} winning point (e.g. 21 → 20).
            </p>
          )}

          {loading && (
            <div className="flex justify-center mt-4">
              <Loader2 className="w-5 h-5 animate-spin text-mustard-gold" />
            </div>
          )}
      </section>

      {isCompleted && (
        <section className="bg-mustard-gold/10 border-2 border-mustard-gold rounded-2xl p-5 text-center">
          <CheckCircle2 className="w-8 h-8 text-mustard-gold mx-auto mb-2" />
          <p className="text-sm font-mono font-bold text-deep-forest uppercase tracking-wider">
            Match Complete
          </p>
          <p className="text-xs font-mono text-deep-forest/60 mt-1">
            {setsWonA > setsWonB ? match.teamA?.name : match.teamB?.name} won {Math.max(setsWonA, setsWonB)}-{Math.min(setsWonA, setsWonB)}
          </p>
          <p className="text-[10px] font-mono text-deep-forest/45 mt-2">
            Use Undo above to reverse the last point and reopen the match.
          </p>
        </section>
      )}

      <div className="text-[9px] font-mono text-deep-forest/40 text-center">
        {config.icon} {config.name} · Best of {config.maxSets} · First to {config.setsToWin}{" "}
        {sport === "BADMINTON" ? "games" : "sets"}
        {sport === "BADMINTON" ? " · each game to 21" : ""}
      </div>
    </div>
  );
}
