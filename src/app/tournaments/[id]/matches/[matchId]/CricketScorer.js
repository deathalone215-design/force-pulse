"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ballsToOvers,
  ballsRemaining,
  inningsTotals,
} from "@/lib/cricket";
import { Loader2, Undo2 } from "lucide-react";

function playerLabel(p) {
  if (!p) return "—";
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

export default function CricketScorer({
  tournament,
  match,
  matchId,
  onRefresh,
}) {
  const oversLimit = match.oversLimit || tournament.oversPerInnings || 20;

  const [busy, setBusy] = useState(false);
  const [battingTeamId, setBattingTeamId] = useState(
    match.battingTeamId || match.teamAId
  );
  const [strikerId, setStrikerId] = useState(match.strikerId || "");
  const [nonStrikerId, setNonStrikerId] = useState(match.nonStrikerId || "");
  const [bowlerId, setBowlerId] = useState(match.bowlerId || "");
  const [dismissalType, setDismissalType] = useState("BOWLED");
  const [dismissedPlayerId, setDismissedPlayerId] = useState("");
  const [extraRuns, setExtraRuns] = useState(1);
  const [newBatsmanId, setNewBatsmanId] = useState("");
  const [newBowlerId, setNewBowlerId] = useState("");

  const teamA = match.teamA;
  const teamB = match.teamB;
  const activeBatId =
    match.status === "LIVE" && match.battingTeamId
      ? match.battingTeamId
      : battingTeamId;
  const battingTeam = activeBatId === teamA?.id ? teamA : teamB;
  const bowlingTeam = activeBatId === teamA?.id ? teamB : teamA;
  const batPlayers = battingTeam?.players || [];
  const bowlPlayers = bowlingTeam?.players || [];

  const needsStart =
    match.status === "SCHEDULED" ||
    (match.status === "LIVE" &&
      match.currentInnings === 1 &&
      match.inningsComplete === 0 &&
      !match.strikerId &&
      (match.cricketBalls || []).length === 0);

  const needsSecondInnings =
    match.status === "LIVE" &&
    match.currentInnings === 1 &&
    match.inningsComplete >= 1;

  const needsNewBatsman =
    match.status === "LIVE" &&
    !needsSecondInnings &&
    match.inningsComplete < 2 &&
    !match.strikerId &&
    !!match.nonStrikerId;

  const needsNewBowler =
    match.status === "LIVE" &&
    !needsSecondInnings &&
    !needsNewBatsman &&
    !!match.strikerId &&
    !match.bowlerId;

  useEffect(() => {
    if (needsSecondInnings || needsStart) {
      setStrikerId("");
      setNonStrikerId("");
      setBowlerId("");
    }
  }, [needsSecondInnings, needsStart, match.inningsComplete]);

  const liveTotals = useMemo(() => {
    if (!match.battingTeamId) return null;
    return inningsTotals(match, match.battingTeamId);
  }, [match]);

  const target =
    match.currentInnings === 2 && match.battingTeamId
      ? (match.battingTeamId === match.teamAId ? match.scoreB : match.scoreA) + 1
      : null;

  const recentBalls = [...(match.cricketBalls || [])].slice(-12).reverse();

  const dismissedIds = useMemo(() => {
    const set = new Set();
    (match.cricketBalls || [])
      .filter((b) => b.innings === match.currentInnings && b.isWicket)
      .forEach((b) => {
        if (b.dismissedPlayerId) set.add(b.dismissedPlayerId);
      });
    return set;
  }, [match]);

  const availableBatters = batPlayers.filter((p) => !dismissedIds.has(p.id));

  const api = async (url, options) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Request failed");
      await onRefresh();
      return data;
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    if (!battingTeamId || !strikerId || !nonStrikerId || !bowlerId) {
      alert("Pick batting side, two openers, and opening bowler");
      return;
    }
    try {
      await api(`/api/matches/${matchId}/cricket/start`, {
        method: "POST",
        body: JSON.stringify({
          battingTeamId,
          strikerId,
          nonStrikerId,
          bowlerId,
        }),
      });
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStartSecond = async () => {
    if (!strikerId || !nonStrikerId || !bowlerId) {
      alert("Pick chase openers and opening bowler");
      return;
    }
    try {
      await api(`/api/matches/${matchId}/cricket/innings`, {
        method: "POST",
        body: JSON.stringify({ strikerId, nonStrikerId, bowlerId }),
      });
    } catch (err) {
      alert(err.message);
    }
  };

  const setPlayers = async (payload) => {
    try {
      await api(`/api/matches/${matchId}/cricket/players`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setNewBatsmanId("");
      setNewBowlerId("");
    } catch (err) {
      alert(err.message);
    }
  };

  const scoreBall = async (payload) => {
    if (needsNewBatsman || needsNewBowler || needsSecondInnings || needsStart) {
      alert("Finish setup first (batsman / bowler / innings)");
      return;
    }
    try {
      await api(`/api/matches/${matchId}/cricket/ball`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      alert(err.message);
    }
  };

  const undoLast = async () => {
    try {
      await api(`/api/matches/${matchId}/cricket/ball`, { method: "DELETE" });
    } catch (err) {
      alert(err.message);
    }
  };

  const battingName =
    match.battingTeamId === teamA?.id ? teamA?.name : teamB?.name;
  const chasingName =
    match.battingTeamId === teamA?.id ? teamA?.name : teamB?.name;

  return (
    <div className="space-y-5">
      {/* Scoreboard */}
      <section className="bg-[#0d472c] border-2 border-mustard-gold rounded-2xl p-4 sm:p-6 shadow-lg text-white">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-[#093c24] pb-3">
          <div>
            <p className="text-[9px] font-mono text-mustard-gold uppercase font-bold tracking-widest">
              Cricket · {oversLimit} overs
            </p>
            <p className="text-xs font-mono text-white/60 mt-0.5">
              Innings {match.currentInnings || 1}
              {match.status === "LIVE" ? " · LIVE" : ` · ${match.status}`}
            </p>
          </div>
          {match.status === "LIVE" && (match.cricketBalls || []).length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={undoLast}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/25 text-[10px] font-mono font-bold uppercase cursor-pointer hover:bg-white/10 disabled:opacity-50 min-h-[40px]"
            >
              <Undo2 className="w-3.5 h-3.5" /> Undo ball
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[teamA, teamB].map((team) => {
            if (!team) return null;
            const tot = inningsTotals(match, team.id);
            const batting = match.battingTeamId === team.id;
            return (
              <div
                key={team.id}
                className={`rounded-xl border p-4 ${
                  batting
                    ? "border-mustard-gold bg-[#093c24]"
                    : "border-white/15 bg-[#082e1c]/80"
                }`}
              >
                <p className="text-[9px] font-mono uppercase text-white/50 font-bold">
                  {batting ? "Batting" : "Bowling / waiting"}
                </p>
                <p className="font-display uppercase text-lg tracking-wide mt-1 truncate">
                  {team.name}
                </p>
                <p className="text-3xl font-mono font-bold text-mustard-gold mt-2">
                  {tot.runs}/{tot.wickets}
                </p>
                <p className="text-xs font-mono text-white/70 mt-1">
                  Overs {ballsToOvers(tot.legalBalls)} / {oversLimit}
                </p>
              </div>
            );
          })}
        </div>

        {target != null && match.status === "LIVE" && liveTotals && (
          <p className="mt-4 text-center text-xs font-mono text-mustard-gold">
            {chasingName} need {Math.max(0, target - liveTotals.runs)} from{" "}
            {ballsRemaining(match, match.battingTeamId)} balls
            {` · Target ${target}`}
          </p>
        )}
      </section>

      {/* Setup screens */}
      {(needsStart || needsSecondInnings) && (
        <section className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest">
            {needsSecondInnings ? "Start second innings (chase)" : "Start match"}
          </h3>

          {needsStart && (
            <div className="space-y-2">
              <p className="text-[9px] font-mono font-bold uppercase text-deep-forest/55">
                Who bats first?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[teamA, teamB].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setBattingTeamId(t.id);
                      setStrikerId("");
                      setNonStrikerId("");
                      setBowlerId("");
                    }}
                    className={`py-3 rounded-xl text-[10px] font-mono font-bold uppercase border cursor-pointer ${
                      battingTeamId === t.id
                        ? "bg-mustard-gold border-mustard-gold text-deep-forest"
                        : "bg-cream-bg border-slate-200 text-deep-forest/70"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {needsSecondInnings && (
            <p className="text-xs font-mono text-deep-forest/60">
              Target:{" "}
              <span className="font-bold text-deep-forest">
                {(match.battingTeamId === teamA?.id ? match.scoreA : match.scoreB) + 1}
              </span>{" "}
              — batting:{" "}
              {match.battingTeamId === teamA?.id ? teamB?.name : teamA?.name}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SelectPlayer
              label="Striker"
              value={strikerId}
              onChange={setStrikerId}
              players={
                needsSecondInnings
                  ? (match.battingTeamId === teamA?.id ? teamB : teamA)?.players ||
                    []
                  : batPlayers
              }
              disabledIds={[nonStrikerId].filter(Boolean)}
            />
            <SelectPlayer
              label="Non-striker"
              value={nonStrikerId}
              onChange={setNonStrikerId}
              players={
                needsSecondInnings
                  ? (match.battingTeamId === teamA?.id ? teamB : teamA)?.players ||
                    []
                  : batPlayers
              }
              disabledIds={[strikerId].filter(Boolean)}
            />
            <SelectPlayer
              label="Bowler"
              value={bowlerId}
              onChange={setBowlerId}
              players={
                needsSecondInnings
                  ? (match.battingTeamId === teamA?.id ? teamA : teamB)?.players ||
                    []
                  : bowlPlayers
              }
            />
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={needsSecondInnings ? handleStartSecond : handleStart}
            className="w-full py-3.5 bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest rounded-xl text-xs font-mono font-bold uppercase cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {needsSecondInnings ? "Begin chase" : "Start innings"}
          </button>
        </section>
      )}

      {needsNewBatsman && (
        <section className="bg-white border-2 border-mustard-gold rounded-2xl p-5 space-y-3 shadow-sm">
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-red-700">
            Wicket — send in next batsman
          </h3>
          <SelectPlayer
            label="New batsman (striker)"
            value={newBatsmanId}
            onChange={setNewBatsmanId}
            players={availableBatters.filter((p) => p.id !== match.nonStrikerId)}
          />
          <button
            type="button"
            disabled={busy || !newBatsmanId}
            onClick={() =>
              setPlayers({
                strikerId: newBatsmanId,
                nonStrikerId: match.nonStrikerId,
              })
            }
            className="w-full py-3 bg-[#0d472c] text-white rounded-xl text-xs font-mono font-bold uppercase cursor-pointer disabled:opacity-50"
          >
            Confirm batsman
          </button>
        </section>
      )}

      {needsNewBowler && (
        <section className="bg-white border-2 border-mustard-gold rounded-2xl p-5 space-y-3 shadow-sm">
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest">
            Over complete — select next bowler
          </h3>
          <SelectPlayer
            label="Bowler"
            value={newBowlerId}
            onChange={setNewBowlerId}
            players={bowlPlayers}
          />
          <button
            type="button"
            disabled={busy || !newBowlerId}
            onClick={() => setPlayers({ bowlerId: newBowlerId })}
            className="w-full py-3 bg-[#0d472c] text-white rounded-xl text-xs font-mono font-bold uppercase cursor-pointer disabled:opacity-50"
          >
            Confirm bowler
          </button>
        </section>
      )}

      {/* Scoring pad */}
      {match.status === "LIVE" &&
        !needsStart &&
        !needsSecondInnings &&
        !needsNewBatsman &&
        !needsNewBowler &&
        match.strikerId &&
        match.bowlerId && (
          <section className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
            <div className="flex flex-wrap gap-3 text-[10px] font-mono text-deep-forest/70">
              <span>
                Striker:{" "}
                <strong className="text-deep-forest">
                  {playerLabel(batPlayers.find((p) => p.id === match.strikerId))}
                </strong>
              </span>
              <span>
                Non-striker:{" "}
                <strong className="text-deep-forest">
                  {playerLabel(batPlayers.find((p) => p.id === match.nonStrikerId))}
                </strong>
              </span>
              <span>
                Bowler:{" "}
                <strong className="text-deep-forest">
                  {playerLabel(bowlPlayers.find((p) => p.id === match.bowlerId))}
                </strong>
              </span>
            </div>

            <div>
              <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/55 mb-2">
                Runs off the bat
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[0, 1, 2, 3, 4, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      scoreBall({ runsOffBat: n, extras: 0, extraType: null })
                    }
                    className="py-4 rounded-xl bg-cream-bg border border-slate-200 hover:border-mustard-gold hover:bg-mustard-gold text-deep-forest font-mono font-bold text-lg cursor-pointer disabled:opacity-50 min-h-[52px]"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/55">
                  Extras
                </p>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-[10px] font-mono text-deep-forest/60">
                    Extra runs
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={extraRuns}
                    onChange={(e) => setExtraRuns(e.target.value)}
                    className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { t: "WD", label: "Wide" },
                    { t: "NB", label: "No-ball" },
                    { t: "BYE", label: "Bye" },
                    { t: "LB", label: "Leg-bye" },
                  ].map((x) => (
                    <button
                      key={x.t}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        scoreBall({
                          runsOffBat: 0,
                          extras: parseInt(extraRuns, 10) || 1,
                          extraType: x.t,
                        })
                      }
                      className="py-2.5 rounded-xl border border-slate-200 bg-[#fcf7ed] text-[10px] font-mono font-bold uppercase cursor-pointer hover:border-mustard-gold disabled:opacity-50"
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/55">
                  Wicket
                </p>
                <select
                  value={dismissalType}
                  onChange={(e) => setDismissalType(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none"
                >
                  {["BOWLED", "CAUGHT", "LBW", "RUN_OUT", "STUMPED", "OTHER"].map(
                    (d) => (
                      <option key={d} value={d}>
                        {d.replace("_", " ")}
                      </option>
                    )
                  )}
                </select>
                <select
                  value={dismissedPlayerId}
                  onChange={(e) => setDismissedPlayerId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none"
                >
                  <option value="">Dismissed (default: striker)</option>
                  {[match.strikerId, match.nonStrikerId]
                    .filter(Boolean)
                    .map((id) => {
                      const p = batPlayers.find((x) => x.id === id);
                      return (
                        <option key={id} value={id}>
                          {playerLabel(p)}
                        </option>
                      );
                    })}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    scoreBall({
                      runsOffBat: 0,
                      extras: 0,
                      extraType: null,
                      isWicket: true,
                      dismissalType,
                      dismissedPlayerId: dismissedPlayerId || match.strikerId,
                    })
                  }
                  className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[10px] font-mono font-bold uppercase cursor-pointer disabled:opacity-50"
                >
                  Record wicket
                </button>
              </div>
            </div>
          </section>
        )}

      {match.status === "COMPLETED" && (
        <section className="bg-white border-2 border-mustard-gold rounded-2xl p-5 text-center">
          <p className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/50">
            Match complete
          </p>
          <p className="text-lg font-display uppercase text-deep-forest mt-2">
            {match.scoreA === match.scoreB
              ? "Tied"
              : match.scoreA > match.scoreB
                ? `${teamA?.name} won`
                : `${teamB?.name} won`}
          </p>
          <p className="text-sm font-mono text-deep-forest/70 mt-1">
            {teamA?.name} {match.scoreA}/{match.wicketsA} · {teamB?.name}{" "}
            {match.scoreB}/{match.wicketsB}
          </p>
        </section>
      )}

      {/* Ball log */}
      {recentBalls.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
          <h4 className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/50">
            Recent balls {battingName ? `· ${battingName}` : ""}
          </h4>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {recentBalls.map((b) => (
              <li
                key={b.id}
                className="flex justify-between text-[10px] font-mono text-deep-forest/70 bg-[#fcf7ed] rounded-lg px-3 py-2"
              >
                <span>
                  Ov {b.overNumber}.{b.ballInOver || "x"}
                  {b.isWicket ? " · W" : ""}
                  {b.extraType ? ` · ${b.extraType}` : ""}
                </span>
                <span className="font-bold text-deep-forest">+{b.runsTotal}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
