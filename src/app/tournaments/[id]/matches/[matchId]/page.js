"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Loader2,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import CricketScorer from "./CricketScorer";
import SetBasedScorer from "./SetBasedScorer";
import { isSetBasedSport } from "@/lib/setBasedSports";
import { getRoundDisplayName } from "@/lib/scheduleFormats";
import {
  formatFootballClock,
  footballElapsedSeconds,
  footballMatchMinute,
  footballClockOpts,
  isFootballClockPaused,
  formatEventMinute,
  FOOTBALL_PERIODS,
  normalizeFootballPeriod,
  footballPeriodLabel,
  footballPeriodShort,
  footballLiveMinuteLabel,
  completedFootballClockLabel,
} from "@/lib/footballClock";
import {
  eventDedupKey,
  mergeMatchFromApi,
  normalizeMatchEvents,
  patchMatchInTournament,
  stripDeletedEvents,
  shouldAcceptServerMatch,
} from "@/lib/matchState";
import {
  casErrorMessage,
  casFields,
  getScoreLockToken,
  isCasConflict,
} from "@/lib/matchCasClient";
import { resolveTeamLogo } from "@/lib/teamLogo";

const getRoundName = (number, totalRounds, format, customName) =>
  getRoundDisplayName(number, totalRounds, format, customName);

const getTeamGradient = (name) => {
  if (!name) return "linear-gradient(135deg, #334155, #0f172a)";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c1 = Math.abs(hash % 360);
  const c2 = (c1 + 130) % 360;
  return `linear-gradient(135deg, hsl(${c1}, 60%, 45%), hsl(${c2}, 60%, 30%))`;
};

function findMatchContext(tournament, matchId) {
  for (const cat of tournament?.categories || []) {
    for (const round of cat.rounds || []) {
      const match = (round.matches || []).find((m) => m.id === matchId);
      if (match) {
        return {
          match,
          category: cat,
          round,
          totalRounds: cat.rounds.length,
        };
      }
    }
  }
  return null;
}

/** Minimal tournament tree so the scorer can render before the full dashboard loads. */
function tournamentShellFromMatch(match, tournamentId) {
  if (!match?.round?.category) return null;
  const category = match.round.category;
  const teams = [match.teamA, match.teamB].filter(Boolean);
  return {
    id: tournamentId,
    categories: [
      {
        ...category,
        teams,
        rounds: [
          {
            id: match.round.id,
            number: match.round.number,
            name: match.round.name,
            matches: [match],
          },
        ],
      },
    ],
  };
}

function TeamCrest({ team, category = null, size = "lg" }) {
  const sizes = {
    md: "w-12 h-12 sm:w-14 sm:h-14 text-sm",
    lg: "w-14 h-14 sm:w-20 sm:h-24 text-base sm:text-xl",
  };
  const logo = resolveTeamLogo(team, category);
  if (logo) {
    return (
      <img
        src={logo}
        alt={team?.name}
        className={`${sizes[size]} rounded-full object-cover border-2 border-white/30 shadow-lg`}
      />
    );
  }
  return (
    <div
      style={{ background: getTeamGradient(team?.name) }}
      className={`${sizes[size]} rounded-full flex items-center justify-center font-bold text-white uppercase select-none border-2 border-white/30 shadow-lg`}
    >
      {(team?.name || "??").slice(0, 2)}
    </div>
  );
}

export default function MatchScorerPage() {
  const { id: tournamentId, matchId } = useParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [submittingEvent, setSubmittingEvent] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [eventType, setEventType] = useState("GOAL");
  const [eventPlayerId, setEventPlayerId] = useState("");
  const [eventMinute, setEventMinute] = useState("");
  const [selectedEventTeamId, setSelectedEventTeamId] = useState("");
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [resettingClock, setResettingClock] = useState(false);
  const [editingClock, setEditingClock] = useState(false);
  const [clockInput, setClockInput] = useState("00:00");
  const [savingClock, setSavingClock] = useState(false);
  /** Visual pulse when clock is set / jumped: "up" | "down" | "set" */
  const [clockMotion, setClockMotion] = useState(null);
  const [extraMotion, setExtraMotion] = useState(null);
  // Ignore late full-tournament GETs; prefer match-scoped refresh after load.
  const fetchGenRef = useRef(0);
  const deletedEventIdsRef = useRef(new Set());
  const pendingWritesRef = useRef(0);
  const writeChainRef = useRef(Promise.resolve());
  /** Always-fresh CAS version — avoids stale closures on rapid goal add/delete. */
  const matchCasRef = useRef({ version: 0 });
  const prevClockSecRef = useRef(null);
  const clockMotionTimerRef = useRef(null);
  const extraMotionTimerRef = useRef(null);

  const pulseClockMotion = useCallback((kind) => {
    if (clockMotionTimerRef.current) clearTimeout(clockMotionTimerRef.current);
    setClockMotion(null);
    // Retrigger CSS animation even if same direction twice
    requestAnimationFrame(() => {
      setClockMotion(kind);
      clockMotionTimerRef.current = setTimeout(() => setClockMotion(null), 500);
    });
  }, []);

  const pulseExtraMotion = useCallback(() => {
    if (extraMotionTimerRef.current) clearTimeout(extraMotionTimerRef.current);
    setExtraMotion(null);
    requestAnimationFrame(() => {
      setExtraMotion("bump");
      extraMotionTimerRef.current = setTimeout(() => setExtraMotion(null), 360);
    });
  }, []);

  /** Initial load — match API first for fast paint, full tournament in parallel. */
  const fetchTournament = useCallback(
    async ({ silent = false } = {}) => {
      const gen = ++fetchGenRef.current;
      try {
        if (!silent) setLoading(true);

        const matchPromise = fetch(`/api/matches/${matchId}`, {
          cache: "no-store",
          credentials: "include",
        });
        const tournamentPromise = fetch(`/api/tournaments/${tournamentId}`, {
          cache: "no-store",
          credentials: "include",
        });

        const matchRes = await matchPromise;
        if (gen !== fetchGenRef.current) return null;

        if (matchRes.ok) {
          const matchData = await matchRes.json();
          const shell = tournamentShellFromMatch(matchData, tournamentId);
          if (shell) {
            setTournament((prev) => {
              if (!prev) return stripDeletedEvents(shell, deletedEventIdsRef.current);
              return prev;
            });
            setSelectedEventTeamId((prev) => prev || matchData.teamAId);
            if (!silent) setLoading(false);
          }
        }

        const res = await tournamentPromise;
        if (gen !== fetchGenRef.current) return null;
        if (!res.ok) {
          if (!matchRes.ok) throw new Error("Tournament not found");
          return null;
        }

        const data = await res.json();

        setTournament((prev) => {
          if (!prev) {
            return stripDeletedEvents(data, deletedEventIdsRef.current);
          }
          const merged = stripDeletedEvents(data, deletedEventIdsRef.current);
          return patchMatchInTournament(merged, matchId, (incoming) => {
            const local = findMatchContext(prev, matchId)?.match;
            if (!local) return incoming;
            if (pendingWritesRef.current > 0) return local;
            if (!shouldAcceptServerMatch(local, incoming)) return local;
            return mergeMatchFromApi(local, incoming, { force: true });
          });
        });

        const ctx = findMatchContext(data, matchId);
        if (!ctx) throw new Error("Match not found in this tournament");

        setSelectedEventTeamId((prev) => prev || ctx.match.teamAId);
        setError(null);
        return data;
      } catch (err) {
        if (gen === fetchGenRef.current) setError(err.message);
        return null;
      } finally {
        if (!silent && gen === fetchGenRef.current) setLoading(false);
      }
    },
    [tournamentId, matchId]
  );

  /**
   * Match-scoped refresh — used after errors / cricket-set recovery.
   * Rejects stale payloads via updatedAt + pending write guard.
   */
  const refreshMatch = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to refresh match");

      const serverIds = new Set((data.events || []).map((e) => e.id));
      for (const id of [...deletedEventIdsRef.current]) {
        if (!serverIds.has(id)) deletedEventIdsRef.current.delete(id);
      }

      setTournament((prev) =>
        patchMatchInTournament(prev, matchId, (local) => {
          if (pendingWritesRef.current > 0) return local;
          // Intentional match refresh — always take server as source of truth
          const merged = mergeMatchFromApi(local, data, { force: true });
          const events = (merged.events || []).filter(
            (e) => !deletedEventIdsRef.current.has(e.id)
          );
          return { ...merged, events };
        })
      );
      return data;
    } catch (err) {
      console.error(err);
      return null;
    }
  }, [matchId]);

  useEffect(() => {
    fetchTournament();
  }, [fetchTournament]);

  const ctx = tournament ? findMatchContext(tournament, matchId) : null;
  const match = ctx?.match;
  const categoryEarly = ctx?.category;

  // Keep CAS version in sync, but never roll it backwards after a local write.
  useEffect(() => {
    if (match?.version == null) return;
    if (match.version >= (matchCasRef.current.version || 0)) {
      matchCasRef.current.version = match.version;
    }
  }, [match?.version]);

  // Football live clock tick (freeze while paused for injury / interruption)
  useEffect(() => {
    if (!match || match.status !== "LIVE" || !match.kickoffAt) return undefined;
    if (isFootballClockPaused(match)) return undefined;
    const id = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [match?.status, match?.kickoffAt, match?.clockPausedAt]);

  const clockOpts = footballClockOpts(match);
  const clockPaused = isFootballClockPaused(match);
  const footballElapsed =
    match?.kickoffAt != null
      ? footballElapsedSeconds(match.kickoffAt, clockNow, clockOpts)
      : 0;
  const footballClock =
    match?.kickoffAt != null ? formatFootballClock(footballElapsed) : "00:00";
  const suggestedMinute =
    match?.kickoffAt != null
      ? footballMatchMinute(match.kickoffAt, clockNow, clockOpts)
      : null;
  const clockPeriod = normalizeFootballPeriod(match?.clockPeriod, match?.status);
  const periodLabel = footballPeriodLabel(match?.clockPeriod, match?.status);
  const periodShort = footballPeriodShort(match?.clockPeriod, match?.status);
  const liveMinuteLabel =
    match?.kickoffAt != null
      ? footballLiveMinuteLabel(
          match,
          clockNow,
          categoryEarly?.fullTimeMinutes
        )
      : null;

  // Animate when clock jumps (manual set / reset), not on normal 1s ticks
  useEffect(() => {
    const prev = prevClockSecRef.current;
    prevClockSecRef.current = footballElapsed;
    if (prev == null || match?.status !== "LIVE") return;
    const delta = footballElapsed - prev;
    if (Math.abs(delta) <= 1) return;
    if (delta > 0) pulseClockMotion("up");
    else pulseClockMotion("down");
  }, [footballElapsed, match?.status, pulseClockMotion]);

  useEffect(() => {
    return () => {
      if (clockMotionTimerRef.current) clearTimeout(clockMotionTimerRef.current);
      if (extraMotionTimerRef.current) clearTimeout(extraMotionTimerRef.current);
    };
  }, []);

  const applyMatchUpdate = useCallback(
    (update, { addEvent, removeEventId, force = true } = {}) => {
      // Invalidate in-flight full tournament GETs.
      fetchGenRef.current += 1;
      if (update?.version != null) {
        matchCasRef.current.version = update.version;
      }
      setTournament((prev) =>
        patchMatchInTournament(prev, matchId, (m) => {
          const stamped = {
            ...update,
            // Optimistic version so stale GETs lose the race.
            updatedAt: update?.updatedAt || new Date().toISOString(),
          };
          let next = mergeMatchFromApi(m, stamped, { force });
          let events = next.events || m.events || [];

          if (removeEventId) {
            events = events.filter((e) => e.id !== removeEventId);
          }
          if (addEvent) {
            const isSavedRow =
              addEvent.id && !String(addEvent.id).startsWith("tmp_");
            events = events.filter((e) => e.id !== addEvent.id);
            if (isSavedRow) {
              // Drop any optimistic placeholder for the same goal/card.
              events = events.filter(
                (e) =>
                  !String(e.id).startsWith("tmp_") ||
                  eventDedupKey(e) !== eventDedupKey(addEvent)
              );
            }
            events = [...events, addEvent];
          }
          if (addEvent || removeEventId) {
            next = { ...next, events: normalizeMatchEvents(events) };
          }
          if (next?.version != null) {
            matchCasRef.current.version = next.version;
          }
          return next;
        })
      );
    },
    [matchId]
  );

  const casBody = useCallback(
    () => casFields({ version: matchCasRef.current.version }, matchId),
    [matchId]
  );

  const withWrite = useCallback(async (fn) => {
    pendingWritesRef.current += 1;
    const run = writeChainRef.current.then(fn, fn);
    writeChainRef.current = run.then(
      () => undefined,
      () => undefined
    );
    try {
      return await run;
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
  }, []);

  const lockClaimedRef = useRef(false);
  useEffect(() => {
    lockClaimedRef.current = false;
  }, [matchId]);

  useEffect(() => {
    if (!matchId || !match?.id || lockClaimedRef.current) return undefined;
    const token = getScoreLockToken(matchId);
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            claimLock: true,
            ...casBody(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data?.id) {
          lockClaimedRef.current = true;
          applyMatchUpdate({
            version: data.version,
            scoreLockId: data.scoreLockId,
            scoreLockedAt: data.scoreLockedAt,
            updatedAt: data.updatedAt,
          });
        }
      } catch {
        /* lock is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, match?.id, applyMatchUpdate, casBody]);

  const updateMatchStatus = async (newStatus, { resetClock = false } = {}) => {
    if (updatingStatus) return;
    if (match?.status === newStatus && !resetClock) return;
    await withWrite(async () => {
      try {
        setUpdatingStatus(true);
        const nowIso = new Date().toISOString();
        const nextKickoff =
          newStatus === "SCHEDULED"
            ? null
            : newStatus === "LIVE" && (!match?.kickoffAt || resetClock)
              ? nowIso
              : undefined;
        applyMatchUpdate({
          status: newStatus,
          ...(nextKickoff !== undefined ? { kickoffAt: nextKickoff } : {}),
          ...(newStatus === "SCHEDULED"
            ? {
                stoppageMinutes: 0,
                penaltyScoreA: 0,
                penaltyScoreB: 0,
                clockPausedAt: null,
                pausedSeconds: 0,
              }
            : {}),
          // Reset → 00:00 and stay paused until Resume
          ...(resetClock
            ? { clockPausedAt: nowIso, pausedSeconds: 0 }
            : {}),
        });
        if (nextKickoff) setClockNow(Date.now());
        const res = await fetch(`/api/matches/${matchId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: newStatus,
            resetClock,
            ...casBody(),
          }),
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          if (isCasConflict(res, data) && data?.match) {
            applyMatchUpdate(data.match);
          }
          throw new Error(casErrorMessage(res, data, "Failed to update status"));
        }
        if (data?.status || data?.id) {
          const patch = {
            status: data.status || newStatus,
            scoreA: data.scoreA,
            scoreB: data.scoreB,
            stoppageMinutes: data.stoppageMinutes,
            penaltyScoreA: data.penaltyScoreA,
            penaltyScoreB: data.penaltyScoreB,
            clockPausedAt: data.clockPausedAt,
            pausedSeconds: data.pausedSeconds,
            clockPeriod: data.clockPeriod,
            updatedAt: data.updatedAt,
            version: data.version,
            scoreLockId: data.scoreLockId,
            scoreLockedAt: data.scoreLockedAt,
          };
          if (data.kickoffAt != null || newStatus === "SCHEDULED") {
            patch.kickoffAt = data.kickoffAt ?? null;
          }
          if (newStatus === "SCHEDULED" || resetClock) {
            patch.clockPausedAt = data.clockPausedAt ?? null;
            patch.pausedSeconds = data.pausedSeconds ?? 0;
          }
          applyMatchUpdate(patch);
          if (data.kickoffAt) setClockNow(Date.now());
        }
      } catch (err) {
        alert(err.message);
        await refreshMatch();
      } finally {
        setUpdatingStatus(false);
      }
    });
  };

  const resetFootballClock = async () => {
    if (!window.confirm("Reset clock to 00:00 (1st half) and pause? Press Resume to start."))
      return;
    try {
      setResettingClock(true);
      await updateMatchStatus("LIVE", { resetClock: true });
    } finally {
      setResettingClock(false);
    }
  };

  const applyPeriodAction = async (periodAction) => {
    if (updatingStatus || !match) return;
    const messages = {
      end_first_half: "End 1st half and go to half-time?",
      start_second_half: "Start 2nd half from 45:00?",
      end_match: "End match (full time)?",
    };
    if (!window.confirm(messages[periodAction] || "Continue?")) return;
    await withWrite(async () => {
      try {
        setUpdatingStatus(true);
        const res = await fetch(`/api/matches/${matchId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodAction,
            ...casBody(),
          }),
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (isCasConflict(res, data) && data?.match) applyMatchUpdate(data.match);
          throw new Error(casErrorMessage(res, data, "Failed to update period"));
        }
        applyMatchUpdate({
          status: data.status,
          kickoffAt: data.kickoffAt,
          clockPausedAt: data.clockPausedAt,
          pausedSeconds: data.pausedSeconds,
          stoppageMinutes: data.stoppageMinutes,
          clockPeriod: data.clockPeriod,
          updatedAt: data.updatedAt,
          version: data.version,
          scoreLockId: data.scoreLockId,
          scoreLockedAt: data.scoreLockedAt,
        });
        setClockNow(Date.now());
      } catch (err) {
        alert(err.message);
        await refreshMatch();
      } finally {
        setUpdatingStatus(false);
      }
    });
  };

  const openClockEditor = () => {
    if (match?.status !== "LIVE" || updatingStatus || savingClock) return;
    setClockInput(footballClock || "00:00");
    setEditingClock(true);
  };

  const parseClockInputParts = useCallback((raw) => {
    const m = String(raw || "").trim().match(/^(\d{1,3})\s*:\s*(\d{1,2})$/);
    if (!m) return null;
    return {
      minutes: parseInt(m[1], 10),
      seconds: Math.min(59, parseInt(m[2], 10)),
    };
  }, []);

  const formatClockParts = useCallback((minutes, seconds) => {
    const total = Math.max(
      0,
      Math.min(180 * 60, Math.max(0, minutes) * 60 + Math.max(0, Math.min(59, seconds)))
    );
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }, []);

  const nudgeClockInput = useCallback(
    (unit, delta) => {
      const parts = parseClockInputParts(clockInput);
      if (!parts) {
        setClockInput(footballClock || "00:00");
        return;
      }
      let { minutes, seconds } = parts;
      if (unit === "minute") minutes += delta;
      else seconds += delta;
      // Carry seconds into minutes
      while (seconds >= 60) {
        seconds -= 60;
        minutes += 1;
      }
      while (seconds < 0) {
        if (minutes <= 0) {
          minutes = 0;
          seconds = 0;
          break;
        }
        minutes -= 1;
        seconds += 60;
      }
      if (minutes < 0) {
        minutes = 0;
        seconds = 0;
      }
      if (minutes > 180) {
        minutes = 180;
        seconds = 0;
      }
      setClockInput(formatClockParts(minutes, seconds));
    },
    [clockInput, footballClock, formatClockParts, parseClockInputParts]
  );

  const saveClockTime = async () => {
    const raw = String(clockInput || "").trim();
    if (!/^\d{1,3}\s*:\s*\d{1,2}$/.test(raw)) {
      alert("Enter time like 12:30");
      return;
    }
    const parts = raw.match(/^(\d{1,3})\s*:\s*(\d{1,2})$/);
    const nextSec =
      parseInt(parts[1], 10) * 60 + Math.min(59, parseInt(parts[2], 10));
    const sameTime = nextSec === footballElapsed;
    await withWrite(async () => {
      try {
        setSavingClock(true);
        const res = await fetch(`/api/matches/${matchId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setClock: raw, ...casBody() }),
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (isCasConflict(res, data) && data?.match) applyMatchUpdate(data.match);
          throw new Error(casErrorMessage(res, data, "Could not set time"));
        }
        applyMatchUpdate({
          kickoffAt: data.kickoffAt,
          clockPausedAt: data.clockPausedAt,
          pausedSeconds: data.pausedSeconds,
          clockPeriod: data.clockPeriod,
          status: data.status || "LIVE",
          updatedAt: data.updatedAt,
          version: data.version,
        });
        setClockNow(Date.now());
        setEditingClock(false);
        if (sameTime) pulseClockMotion("set");
      } catch (err) {
        alert(err.message);
        await refreshMatch();
      } finally {
        setSavingClock(false);
      }
    });
  };

  const setStoppageMinutes = async (value) => {
    const prev = match?.stoppageMinutes || 0;
    const n = Math.max(0, Math.min(30, parseInt(value, 10) || 0));
    if (n !== prev) pulseExtraMotion();
    await withWrite(async () => {
      applyMatchUpdate({ stoppageMinutes: n });
      try {
        const res = await fetch(`/api/matches/${matchId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stoppageMinutes: n,
            ...casBody(),
          }),
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (isCasConflict(res, data) && data?.match) applyMatchUpdate(data.match);
          throw new Error(casErrorMessage(res, data, "Failed to set stoppage"));
        }
        if (data.stoppageMinutes != null) {
          applyMatchUpdate({
            stoppageMinutes: data.stoppageMinutes,
            clockPausedAt: data.clockPausedAt,
            pausedSeconds: data.pausedSeconds,
            updatedAt: data.updatedAt,
            version: data.version,
          });
        }
      } catch (err) {
        alert(err.message);
        await refreshMatch();
      }
    });
  };

  const toggleFootballClockPause = async () => {
    if (!match?.kickoffAt || updatingStatus) return;
    const action = clockPaused ? "resume" : "pause";
    await withWrite(async () => {
      const optimistic =
        action === "pause"
          ? { clockPausedAt: new Date().toISOString() }
          : {
              clockPausedAt: null,
              pausedSeconds:
                (match.pausedSeconds || 0) +
                Math.max(
                  0,
                  Math.floor(
                    (Date.now() - new Date(match.clockPausedAt).getTime()) / 1000
                  )
                ),
            };
      applyMatchUpdate(optimistic);
      if (action === "resume") setClockNow(Date.now());
      try {
        setUpdatingStatus(true);
        const res = await fetch(`/api/matches/${matchId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clockAction: action,
            ...casBody(),
          }),
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (isCasConflict(res, data) && data?.match) applyMatchUpdate(data.match);
          throw new Error(casErrorMessage(res, data, `Failed to ${action} clock`));
        }
        applyMatchUpdate({
          clockPausedAt: data.clockPausedAt ?? null,
          pausedSeconds: data.pausedSeconds ?? 0,
          kickoffAt: data.kickoffAt,
          status: data.status,
          updatedAt: data.updatedAt,
          version: data.version,
        });
        if (action === "resume") setClockNow(Date.now());
      } catch (err) {
        alert(err.message);
        await refreshMatch();
      } finally {
        setUpdatingStatus(false);
      }
    });
  };

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!match || submittingEvent) return;
    if (!eventPlayerId) {
      alert("Please select a player associated with the event.");
      return;
    }

    await withWrite(async () => {
      let tempEventId = null;
      try {
        setSubmittingEvent(true);

        let eventTeamId = null;
        let side = null;
        const teamA = match.teamA;
        const teamB = match.teamB;

        if (selectedEventTeamId === match.teamAId) {
          eventTeamId = match.teamAId;
          side = "A";
        } else if (selectedEventTeamId === match.teamBId) {
          eventTeamId = match.teamBId;
          side = "B";
        } else if (teamA?.players?.some((p) => p.id === eventPlayerId)) {
          eventTeamId = match.teamAId;
          side = "A";
        } else if (teamB?.players?.some((p) => p.id === eventPlayerId)) {
          eventTeamId = match.teamBId;
          side = "B";
        } else {
          eventTeamId = selectedEventTeamId || match.teamAId;
          side =
            eventTeamId === match.teamBId
              ? "B"
              : "A";
        }

        const t = String(eventType || "").toUpperCase();
        let optA = match.scoreA || 0;
        let optB = match.scoreB || 0;
        let optPenA = match.penaltyScoreA || 0;
        let optPenB = match.penaltyScoreB || 0;
        if (t === "GOAL" || t === "PENALTY_GOAL") {
          if (side === "A") optA += 1;
          else optB += 1;
        } else if (t === "OWN_GOAL") {
          if (side === "A") optB += 1;
          else optA += 1;
        } else if (t === "SHOOTOUT_SCORED") {
          if (side === "A") optPenA += 1;
          else optPenB += 1;
        }

        const players =
          side === "A" ? match.teamA?.players || [] : match.teamB?.players || [];
        const player = players.find((p) => p.id === eventPlayerId) || null;
        tempEventId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const tempEvent = {
          id: tempEventId,
          type: t,
          teamId: eventTeamId,
          playerId: eventPlayerId,
          player,
          minute: eventMinute
            ? parseInt(eventMinute, 10)
            : suggestedMinute,
          createdAt: new Date().toISOString(),
        };
        applyMatchUpdate(
          {
            scoreA: optA,
            scoreB: optB,
            penaltyScoreA: optPenA,
            penaltyScoreB: optPenB,
            status: match.status === "SCHEDULED" ? "LIVE" : match.status,
          },
          { addEvent: tempEvent }
        );

        const res = await fetch(`/api/matches/${matchId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            type: eventType,
            teamId: eventTeamId,
            side,
            playerId: eventPlayerId,
            minute: eventMinute
              ? parseInt(eventMinute, 10)
              : suggestedMinute,
            ...casBody(),
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (isCasConflict(res, data) && data?.match) {
            applyMatchUpdate(data.match, { removeEventId: tempEventId });
          }
          throw new Error(casErrorMessage(res, data, "Failed to record event"));
        }

        if (data.match) {
          // Replace optimistic tmp row with the saved DB event (same goal, one row).
          applyMatchUpdate(data.match, {
            addEvent: data.event,
            removeEventId: tempEventId,
          });
        } else {
          await refreshMatch();
        }
        setEventPlayerId("");
        setEventMinute("");
      } catch (err) {
        alert(err.message);
        await refreshMatch();
      } finally {
        setSubmittingEvent(false);
      }
    });
  };

  const handleDeleteEvent = async (eventId) => {
    if (!eventId || !match) return;
    if (!window.confirm("Delete this event? Score will update.")) return;

    // Optimistic preview never hit the DB — drop locally and undo score bump.
    if (String(eventId).startsWith("tmp_")) {
      const event = (match.events || []).find((e) => e.id === eventId);
      const t = String(event?.type || "").toUpperCase();
      let scoreA = match.scoreA;
      let scoreB = match.scoreB;
      let penaltyScoreA = match.penaltyScoreA ?? 0;
      let penaltyScoreB = match.penaltyScoreB ?? 0;

      if (event) {
        if (t === "GOAL" || t === "PENALTY_GOAL") {
          if (event.teamId === match.teamAId) scoreA = Math.max(0, scoreA - 1);
          else if (event.teamId === match.teamBId) scoreB = Math.max(0, scoreB - 1);
        } else if (t === "OWN_GOAL") {
          if (event.teamId === match.teamAId) scoreB = Math.max(0, scoreB - 1);
          else if (event.teamId === match.teamBId) scoreA = Math.max(0, scoreA - 1);
        } else if (t === "SHOOTOUT_SCORED") {
          if (event.teamId === match.teamAId) penaltyScoreA = Math.max(0, penaltyScoreA - 1);
          else if (event.teamId === match.teamBId) penaltyScoreB = Math.max(0, penaltyScoreB - 1);
        }
      }

      applyMatchUpdate(
        { scoreA, scoreB, penaltyScoreA, penaltyScoreB },
        { removeEventId: eventId }
      );
      return;
    }

    const event = (match.events || []).find((e) => e.id === eventId);
    const t = String(event?.type || "").toUpperCase();
    let scoreA = match.scoreA;
    let scoreB = match.scoreB;
    let penaltyScoreA = match.penaltyScoreA ?? 0;
    let penaltyScoreB = match.penaltyScoreB ?? 0;

    if (event) {
      if (t === "GOAL" || t === "PENALTY_GOAL") {
        if (event.teamId === match.teamAId) scoreA = Math.max(0, scoreA - 1);
        else if (event.teamId === match.teamBId) scoreB = Math.max(0, scoreB - 1);
      } else if (t === "OWN_GOAL") {
        if (event.teamId === match.teamAId) scoreB = Math.max(0, scoreB - 1);
        else if (event.teamId === match.teamBId) scoreA = Math.max(0, scoreA - 1);
      } else if (t === "SHOOTOUT_SCORED") {
        if (event.teamId === match.teamAId) penaltyScoreA = Math.max(0, penaltyScoreA - 1);
        else if (event.teamId === match.teamBId) penaltyScoreB = Math.max(0, penaltyScoreB - 1);
      }
    }

    await withWrite(async () => {
      deletedEventIdsRef.current.add(eventId);
      applyMatchUpdate(
        { scoreA, scoreB, penaltyScoreA, penaltyScoreB },
        { removeEventId: eventId }
      );

      try {
        const res = await fetch(`/api/matches/${matchId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            action: "delete",
            eventId,
            ...casBody(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (isCasConflict(res, data) && data?.match) {
            applyMatchUpdate(data.match);
          }
          throw new Error(casErrorMessage(res, data, "Failed to delete event"));
        }
        if (data.match) {
          applyMatchUpdate(
            {
              scoreA: data.match.scoreA,
              scoreB: data.match.scoreB,
              penaltyScoreA: data.match.penaltyScoreA,
              penaltyScoreB: data.match.penaltyScoreB,
              updatedAt: data.match.updatedAt,
              version: data.match.version,
            },
            { removeEventId: eventId }
          );
        }
      } catch (err) {
        deletedEventIdsRef.current.delete(eventId);
        alert(err.message);
        await refreshMatch();
      }
    });
  };

  const goBack = () => {
    startTransition(() => {
      router.push(`/tournaments/${tournamentId}`);
    });
  };

  const clockEditParts = editingClock
    ? parseClockInputParts(clockInput)
    : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-cream-bg gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-mustard-gold" />
        <p className="text-xs font-mono text-deep-forest/50 uppercase tracking-widest">
          Opening scorer console...
        </p>
      </div>
    );
  }

  if (error || !tournament || !match) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-cream-bg px-4 text-center gap-4">
        <ShieldAlert className="w-12 h-12 text-red-600" />
        <h2 className="text-lg font-bold font-mono uppercase">Scorer unavailable</h2>
        <p className="text-sm text-deep-forest/60 font-mono">
          {error || "Match not found"}
        </p>
        <Link
          href={`/tournaments/${tournamentId}`}
          className="px-5 py-2.5 bg-mustard-gold text-deep-forest rounded-xl text-xs font-mono font-bold uppercase"
        >
          Back to tournament
        </Link>
      </div>
    );
  }

  const category = ctx?.category;
  const isCricket = category?.sport === "CRICKET";
  const isSetBased = isSetBasedSport(category?.sport);
  const sportName = category?.sport
    ? category.sport.charAt(0) + category.sport.slice(1).toLowerCase()
    : "Match";

  const playersForTeam =
    selectedEventTeamId === match.teamAId
      ? match.teamA?.players || []
      : match.teamB?.players || [];

  return (
    <div className="min-h-screen flex flex-col bg-cream-bg overflow-x-hidden">
      {/* Top bar */}
      <header className="pitch-stripes border-b-2 border-mustard-gold text-white sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={goBack}
              disabled={isPending}
              className="p-2.5 rounded-xl border border-white/20 text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Back to tournament"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-mustard-gold animate-pulse shrink-0" />
                <h1 className="text-[11px] sm:text-sm font-mono font-bold uppercase tracking-wider truncate">
                  <span className="sm:hidden">
                    {isCricket ? "Cricket Scorer" : isSetBased ? `${sportName} Scorer` : "Scorer Console"}
                  </span>
                  <span className="hidden sm:inline">
                    {isCricket
                      ? "Cricket Ball-by-Ball Scorer"
                      : isSetBased
                        ? `${sportName} Live Scorer`
                        : "Live Match Scorer Console"}
                  </span>
                </h1>
              </div>
              <p className="text-[9px] sm:text-[10px] font-mono text-white/55 mt-0.5 truncate">
                {tournament.name}
                {isCricket && category?.oversPerInnings
                  ? ` · ${category.oversPerInnings} overs`
                  : ""}
                {!isCricket &&
                !isSetBased &&
                category?.fullTimeMinutes
                  ? ` · ${category.fullTimeMinutes}'${
                      category.extraTimeMinutes
                        ? `+${category.extraTimeMinutes}`
                        : ""
                    }`
                  : ""}
                {category ? ` · ${category.name}` : ""}
                {ctx.round
                  ? ` · ${getRoundName(
                      ctx.round.number,
                      ctx.totalRounds,
                      category?.scheduleFormat,
                      ctx.round.name
                    )}`
                  : ""}
              </p>
            </div>
          </div>
          <Link
            href={`/live/${tournamentId}`}
            target="_blank"
            className="hidden sm:inline-flex text-[10px] font-mono font-bold uppercase tracking-wider px-3 py-2 rounded-xl border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            Public board ↗
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-5 sm:space-y-6">
        {isCricket ? (
          <CricketScorer
            tournament={tournament}
            category={category}
            match={match}
            matchId={matchId}
            onMatchUpdate={applyMatchUpdate}
            onRefresh={refreshMatch}
          />
        ) : null}

        {isSetBased ? (
          <SetBasedScorer
            tournament={tournament}
            category={category}
            match={match}
            matchId={matchId}
            onMatchUpdate={applyMatchUpdate}
            onRefresh={refreshMatch}
          />
        ) : null}

        {!isCricket && !isSetBased && (
        <>
        {/* Scoreboard */}
        <section className="bg-[#0d472c] border-2 border-mustard-gold rounded-2xl p-4 sm:p-6 shadow-lg text-white">
          <div className="flex flex-col gap-4 mb-5 border-b border-[#093c24] pb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono text-mustard-gold uppercase font-bold">
                Match status
              </span>
              {[
                { id: "SCHEDULED", label: "Scheduled" },
                { id: "LIVE", label: "Live" },
                { id: "COMPLETED", label: "Completed" },
              ].map(({ id, label }) => {
                const active = match.status === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={updatingStatus || active}
                    onClick={() => updateMatchStatus(id)}
                    className={`text-xs font-bold rounded-lg px-3 py-2 min-h-[40px] border cursor-pointer disabled:cursor-default transition-colors ${
                      active
                        ? id === "LIVE"
                          ? "bg-red-600 border-red-400 text-white"
                          : id === "COMPLETED"
                            ? "bg-mustard-gold border-mustard-gold text-[#0d472c]"
                            : "bg-white/20 border-white/40 text-white"
                        : "bg-[#093c24] border-white/25 text-white/70 hover:border-mustard-gold/50 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              {updatingStatus && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-mustard-gold" />
              )}
            </div>

            {match.status === "LIVE" && (
              <div className="w-full max-w-lg rounded-2xl bg-gradient-to-b from-[#0a331f] to-[#06371d] border border-mustard-gold/30 p-3.5 sm:p-4 space-y-3 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
                {editingClock ? (
                  <>
                    <div className="rounded-2xl bg-[#041f12]/70 border border-mustard-gold/50 px-3 sm:px-4 py-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 px-1">
                        <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-mustard-gold/80">
                          Set time
                        </span>
                        <span className="text-[10px] font-mono text-white/35">
                          MM : SS
                        </span>
                      </div>

                      <div className="flex items-end justify-center gap-2 sm:gap-3">
                        {/* Minutes */}
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/40">
                            Min
                          </span>
                          <button
                            type="button"
                            disabled={savingClock}
                            onClick={() => nudgeClockInput("minute", 1)}
                            className="w-11 h-10 rounded-xl bg-[#06371d] border border-white/15 text-white text-xl font-bold cursor-pointer hover:border-mustard-gold/50 hover:bg-white/5 disabled:opacity-40 transition-colors"
                            title="+1 minute"
                          >
                            +
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoFocus
                            value={
                              clockEditParts
                                ? String(clockEditParts.minutes).padStart(2, "0")
                                : "00"
                            }
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, "").slice(0, 3);
                              const secs = clockEditParts?.seconds ?? 0;
                              const mins = raw === "" ? 0 : parseInt(raw, 10);
                              if (!Number.isFinite(mins)) return;
                              setClockInput(formatClockParts(mins, secs));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveClockTime();
                              if (e.key === "Escape") setEditingClock(false);
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                nudgeClockInput("minute", 1);
                              }
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                nudgeClockInput("minute", -1);
                              }
                            }}
                            className="w-[4.25rem] sm:w-[4.75rem] bg-[#06371d]/80 border border-mustard-gold/35 rounded-xl text-center text-3xl sm:text-4xl font-mono font-bold text-mustard-gold tabular-nums outline-none tracking-wider caret-mustard-gold py-2 focus:border-mustard-gold"
                          />
                          <button
                            type="button"
                            disabled={savingClock}
                            onClick={() => nudgeClockInput("minute", -1)}
                            className="w-11 h-10 rounded-xl bg-[#06371d] border border-white/15 text-white text-xl font-bold cursor-pointer hover:border-mustard-gold/50 hover:bg-white/5 disabled:opacity-40 transition-colors"
                            title="−1 minute"
                          >
                            −
                          </button>
                        </div>

                        <span className="pb-[3.15rem] text-3xl sm:text-4xl font-mono font-bold text-mustard-gold/70 select-none">
                          :
                        </span>

                        {/* Seconds */}
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/40">
                            Sec
                          </span>
                          <button
                            type="button"
                            disabled={savingClock}
                            onClick={() => nudgeClockInput("second", 1)}
                            className="w-11 h-10 rounded-xl bg-[#06371d] border border-white/15 text-white text-xl font-bold cursor-pointer hover:border-mustard-gold/50 hover:bg-white/5 disabled:opacity-40 transition-colors"
                            title="+1 second"
                          >
                            +
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={
                              clockEditParts
                                ? String(clockEditParts.seconds).padStart(2, "0")
                                : "00"
                            }
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
                              const mins = clockEditParts?.minutes ?? 0;
                              let secs = raw === "" ? 0 : parseInt(raw, 10);
                              if (!Number.isFinite(secs)) return;
                              if (secs > 59) secs = 59;
                              setClockInput(formatClockParts(mins, secs));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveClockTime();
                              if (e.key === "Escape") setEditingClock(false);
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                nudgeClockInput("second", 1);
                              }
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                nudgeClockInput("second", -1);
                              }
                            }}
                            className="w-[4.25rem] sm:w-[4.75rem] bg-[#06371d]/80 border border-mustard-gold/35 rounded-xl text-center text-3xl sm:text-4xl font-mono font-bold text-mustard-gold tabular-nums outline-none tracking-wider caret-mustard-gold py-2 focus:border-mustard-gold"
                          />
                          <button
                            type="button"
                            disabled={savingClock}
                            onClick={() => nudgeClockInput("second", -1)}
                            className="w-11 h-10 rounded-xl bg-[#06371d] border border-white/15 text-white text-xl font-bold cursor-pointer hover:border-mustard-gold/50 hover:bg-white/5 disabled:opacity-40 transition-colors"
                            title="−1 second"
                          >
                            −
                          </button>
                        </div>
                      </div>

                      <p className="text-center text-[10px] text-white/35 font-mono">
                        Adjust minutes and seconds separately
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={savingClock}
                        onClick={() => setEditingClock(false)}
                        className="min-h-[48px] text-sm font-bold text-white/80 border border-white/20 rounded-xl hover:bg-white/5 cursor-pointer disabled:opacity-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingClock}
                        onClick={saveClockTime}
                        className="min-h-[48px] text-sm font-bold bg-mustard-gold text-[#0d472c] rounded-xl hover:bg-mustard-gold-hover cursor-pointer disabled:opacity-50 transition-colors shadow-[0_0_0_1px_rgba(229,169,59,0.35)]"
                      >
                        {savingClock ? "Saving…" : "Set time"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 px-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          {
                            id: FOOTBALL_PERIODS.FIRST_HALF,
                            label: "1H",
                          },
                          {
                            id: FOOTBALL_PERIODS.HALF_TIME,
                            label: "HT",
                          },
                          {
                            id: FOOTBALL_PERIODS.SECOND_HALF,
                            label: "2H",
                          },
                          {
                            id: FOOTBALL_PERIODS.FULL_TIME,
                            label: "FT",
                          },
                        ].map((p) => {
                          const active = clockPeriod === p.id;
                          return (
                            <span
                              key={p.id}
                              className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-1 rounded-lg border ${
                                active
                                  ? "bg-mustard-gold text-[#0d472c] border-mustard-gold"
                                  : "bg-transparent text-white/35 border-white/10"
                              }`}
                            >
                              {p.label}
                            </span>
                          );
                        })}
                      </div>
                      {liveMinuteLabel && (
                        <span className="text-xs font-mono font-bold text-mustard-gold/90 tabular-nums">
                          {liveMinuteLabel}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={openClockEditor}
                      title="Tap to set time"
                      className={`group relative flex items-center gap-3 sm:gap-4 w-full rounded-2xl px-4 sm:px-5 py-4 cursor-pointer transition-all hover:brightness-110 ${
                        clockPaused
                          ? "bg-[#1a2e14] border border-amber-400/55"
                          : "bg-[#041f12]/80 border border-mustard-gold/35"
                      }`}
                    >
                      <div className="flex flex-col items-start gap-1 shrink-0">
                        <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-white/40">
                          Time
                        </span>
                        <span className="text-[9px] font-mono uppercase tracking-wider text-mustard-gold/70">
                          {periodShort}
                        </span>
                      </div>
                      <span
                        className={`flex-1 text-left text-4xl sm:text-[3.25rem] font-mono font-bold tabular-nums tracking-wider leading-none inline-block origin-left ${
                          clockPaused ? "text-amber-300" : "text-mustard-gold"
                        } ${
                          clockMotion === "up"
                            ? "fp-clock-motion-up"
                            : clockMotion === "down"
                              ? "fp-clock-motion-down"
                              : clockMotion === "set"
                                ? "fp-clock-motion-set"
                                : ""
                        }`}
                      >
                        {footballClock}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-white/25 group-hover:text-mustard-gold/70 transition-colors shrink-0 border border-white/10 group-hover:border-mustard-gold/40 rounded-lg px-2 py-1">
                        Edit
                      </span>
                    </button>

                    <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1.35fr] gap-2">
                      {clockPeriod === FOOTBALL_PERIODS.HALF_TIME ? (
                        <button
                          type="button"
                          onClick={() => applyPeriodAction("start_second_half")}
                          disabled={updatingStatus}
                          className="text-sm font-bold rounded-xl px-3 py-3 border cursor-pointer disabled:opacity-50 min-h-[48px] transition-colors text-[#0d472c] bg-emerald-400 border-emerald-300 hover:bg-emerald-300 col-span-2 sm:col-span-1"
                        >
                          Start 2nd half
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={toggleFootballClockPause}
                          disabled={updatingStatus || !match.kickoffAt}
                          className={`text-sm font-bold rounded-xl px-3 py-3 border cursor-pointer disabled:opacity-50 min-h-[48px] transition-colors ${
                            clockPaused
                              ? "text-[#0d472c] bg-emerald-400 border-emerald-300 hover:bg-emerald-300"
                              : "text-mustard-gold border-mustard-gold/55 bg-mustard-gold/5 hover:bg-mustard-gold/15"
                          }`}
                        >
                          {clockPaused ? "Resume" : "Pause"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={resetFootballClock}
                        disabled={resettingClock || updatingStatus}
                        className="text-sm font-bold text-white/85 border border-white/20 rounded-xl px-3 py-3 hover:bg-white/5 hover:border-white/35 cursor-pointer disabled:opacity-50 min-h-[48px] transition-colors"
                      >
                        {resettingClock ? "…" : "Reset"}
                      </button>
                      <div className="col-span-2 sm:col-span-1 flex items-center justify-between gap-2 bg-[#041f12]/70 border border-white/12 rounded-xl px-2.5 py-1.5 min-h-[48px]">
                        <span className="text-[9px] font-mono uppercase text-white/40 tracking-[0.18em] px-1 shrink-0">
                          Extra
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setStoppageMinutes((match.stoppageMinutes || 0) - 1)
                            }
                            className="w-9 h-9 rounded-lg bg-[#06371d] border border-white/12 text-white text-lg font-bold cursor-pointer hover:border-mustard-gold/40 hover:bg-white/5 transition-colors"
                          >
                            −
                          </button>
                          <span
                            className={`text-base font-mono font-bold text-mustard-gold tabular-nums min-w-[3rem] text-center inline-block ${
                              extraMotion ? "fp-extra-motion" : ""
                            }`}
                          >
                            +{match.stoppageMinutes || 0}&apos;
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setStoppageMinutes((match.stoppageMinutes || 0) + 1)
                            }
                            className="w-9 h-9 rounded-lg bg-[#06371d] border border-white/12 text-white text-lg font-bold cursor-pointer hover:border-mustard-gold/40 hover:bg-white/5 transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {clockPeriod === FOOTBALL_PERIODS.FIRST_HALF && (
                        <button
                          type="button"
                          onClick={() => applyPeriodAction("end_first_half")}
                          disabled={updatingStatus}
                          className="text-xs font-bold text-mustard-gold border border-mustard-gold/40 rounded-xl px-3 py-2.5 hover:bg-mustard-gold/10 cursor-pointer disabled:opacity-50 min-h-[44px]"
                        >
                          End 1st half → HT
                        </button>
                      )}
                      {clockPeriod === FOOTBALL_PERIODS.SECOND_HALF && (
                        <button
                          type="button"
                          onClick={() => applyPeriodAction("end_match")}
                          disabled={updatingStatus}
                          className="text-xs font-bold text-mustard-gold border border-mustard-gold/40 rounded-xl px-3 py-2.5 hover:bg-mustard-gold/10 cursor-pointer disabled:opacity-50 min-h-[44px]"
                        >
                          Full time
                        </button>
                      )}
                      {clockPeriod === FOOTBALL_PERIODS.HALF_TIME && (
                        <button
                          type="button"
                          onClick={() => applyPeriodAction("end_match")}
                          disabled={updatingStatus}
                          className="text-xs font-bold text-white/70 border border-white/20 rounded-xl px-3 py-2.5 hover:bg-white/5 cursor-pointer disabled:opacity-50 min-h-[44px]"
                        >
                          End match (FT)
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      {clockPeriod === FOOTBALL_PERIODS.HALF_TIME ? (
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-amber-300">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                          Half-time
                        </span>
                      ) : clockPaused ? (
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-amber-300">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                          Paused · {periodLabel}
                        </span>
                      ) : match.kickoffAt ? (
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-red-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                          Live · {periodLabel}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-red-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                          Starting…
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-white/30 tracking-wide">
                        Tap clock to adjust
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {match.status === "COMPLETED" && (
              <span className="text-xs text-mustard-gold/90 font-bold">
                Match finished
                {(() => {
                  const label = completedFootballClockLabel({
                    fullTimeMinutes: category?.fullTimeMinutes,
                    extraTimeMinutes: category?.extraTimeMinutes,
                    stoppageMinutes: match.stoppageMinutes,
                    tournamentId,
                    kickoffAt: match.kickoffAt,
                    clockOpts: footballClockOpts(match),
                    now: clockNow,
                  });
                  return label ? ` · ${label} FT` : "";
                })()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 items-center gap-2 sm:gap-6 text-center">
            <div className="flex flex-col items-center gap-2 sm:gap-3 min-w-0">
              <TeamCrest team={match.teamA} category={category} />
              <h2 className="text-[10px] sm:text-base font-bold uppercase tracking-wider leading-tight px-0.5 line-clamp-2 break-words">
                {match.teamA?.name}
              </h2>
            </div>

            <div className="flex items-center justify-center gap-1.5 sm:gap-4">
              <span className="text-3xl sm:text-6xl font-mono font-bold text-white bg-[#0a331f] border border-black/40 px-2.5 sm:px-5 py-1.5 sm:py-3 rounded-xl sm:rounded-2xl min-w-[44px] sm:min-w-[72px] shadow-inner tabular-nums">
                {match.scoreA}
              </span>
              <span className="text-slate-400 font-bold text-lg sm:text-3xl font-mono">
                :
              </span>
              <span className="text-3xl sm:text-6xl font-mono font-bold text-white bg-[#0a331f] border border-black/40 px-2.5 sm:px-5 py-1.5 sm:py-3 rounded-xl sm:rounded-2xl min-w-[44px] sm:min-w-[72px] shadow-inner tabular-nums">
                {match.scoreB}
              </span>
            </div>

            <div className="flex flex-col items-center gap-2 sm:gap-3 min-w-0">
              <TeamCrest team={match.teamB} category={category} />
              <h2 className="text-[10px] sm:text-base font-bold uppercase tracking-wider leading-tight px-0.5 line-clamp-2 break-words">
                {match.teamB?.name}
              </h2>
            </div>
          </div>
        </section>

        {/* Events + log */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border-2 border-dashed border-mustard-gold p-5 sm:p-6 rounded-2xl space-y-4 shadow-sm">
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0a331f]/70 border-b border-slate-100 pb-2">
              Add event
            </h3>

            <form onSubmit={handleAddEvent} className="space-y-4">
              <div>
                <label className="block text-[9px] font-mono text-[#0a331f]/60 uppercase tracking-wider mb-2">
                  What happened
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: "GOAL", label: "⚽ Goal" },
                    { id: "PENALTY_GOAL", label: "🎯 Pen goal" },
                    { id: "OWN_GOAL", label: "❌ Own goal" },
                    { id: "PENALTY_MISS", label: "🚫 Pen miss" },
                    { id: "YELLOW_CARD", label: "🟨 Yellow" },
                    { id: "RED_CARD", label: "🟥 Red" },
                  ].map((evt) => (
                    <button
                      key={evt.id}
                      type="button"
                      onClick={() => setEventType(evt.id)}
                      className={`py-2.5 px-3 border rounded-xl text-xs font-mono text-center cursor-pointer transition-all ${
                        eventType === evt.id
                          ? "bg-mustard-gold text-deep-forest border-mustard-gold font-bold shadow-sm"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {evt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-mono text-[#0a331f]/60 uppercase tracking-wider mb-2 font-bold">
                  Team
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEventTeamId(match.teamAId);
                      setEventPlayerId("");
                    }}
                    className={`py-3 px-2 sm:px-3 border rounded-xl text-[10px] sm:text-xs font-mono text-center cursor-pointer transition-all truncate ${
                      selectedEventTeamId === match.teamAId
                        ? "bg-[#0d472c] text-white border-[#0d472c] font-bold shadow-sm"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                    title={match.teamA?.name}
                  >
                    {match.teamA?.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEventTeamId(match.teamBId);
                      setEventPlayerId("");
                    }}
                    className={`py-3 px-2 sm:px-3 border rounded-xl text-[10px] sm:text-xs font-mono text-center cursor-pointer transition-all truncate ${
                      selectedEventTeamId === match.teamBId
                        ? "bg-[#0d472c] text-white border-[#0d472c] font-bold shadow-sm"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                    title={match.teamB?.name}
                  >
                    {match.teamB?.name}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-mono text-[#0a331f]/60 uppercase tracking-wider mb-2 font-bold">
                  Player
                </label>
                <select
                  required
                  value={eventPlayerId}
                  onChange={(e) => setEventPlayerId(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-3 text-xs text-deep-forest outline-none transition-all cursor-pointer shadow-sm"
                >
                  <option value="">-- Pick player --</option>
                  {playersForTeam.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (#{p.shirtNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono text-[#0a331f]/60 uppercase tracking-wider mb-2">
                  Minute (optional)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="1"
                    max="120"
                    placeholder={
                      suggestedMinute != null
                        ? `Auto ${suggestedMinute}'`
                        : "e.g. 78"
                    }
                    value={eventMinute}
                    onChange={(e) => setEventMinute(e.target.value)}
                    className="flex-1 bg-white border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-3 text-xs text-deep-forest outline-none transition-all shadow-sm"
                  />
                  <span className="text-xs font-mono text-slate-400">min</span>
                </div>
                {match.status === "LIVE" && suggestedMinute != null && !eventMinute && (
                  <p className="text-[9px] font-mono text-deep-forest/45 mt-1.5">
                    Leave empty to use clock ({suggestedMinute}&apos;)
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={submittingEvent}
                className="w-full bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase tracking-wider py-3.5 rounded-xl text-xs transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submittingEvent ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </form>
          </div>

          <div className="bg-white border-2 border-dashed border-mustard-gold p-5 sm:p-6 rounded-2xl flex flex-col shadow-sm min-h-[360px]">
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0a331f]/60 border-b border-slate-100 pb-2 mb-3">
              Events
            </h3>

            <div className="flex-1 space-y-2 overflow-y-auto max-h-[420px] pr-1">
              {match.events && match.events.length > 0 ? (
                [...match.events].reverse().map((event) => {
                  const isTeamA = event.teamId === match.teamAId;
                  return (
                    <div
                      key={event.id}
                      className="flex justify-between items-center text-xs font-mono bg-[#fcf7ed] border border-transparent hover:border-slate-200 px-3.5 py-3 rounded-xl transition-all shadow-sm"
                    >
                      <div className="flex items-center gap-2 truncate min-w-0">
                        <span className="text-mustard-gold font-bold shrink-0">
                          {formatEventMinute(
                            event.minute,
                            match.stoppageMinutes
                          )}
                        </span>
                        <span className="text-deep-forest shrink-0">
                          {event.type === "GOAL"
                            ? "⚽ Goal"
                            : event.type === "OWN_GOAL"
                              ? "❌ OG"
                              : event.type === "PENALTY_GOAL"
                                ? "🎯 Pen"
                                : event.type === "PENALTY_MISS"
                                  ? "🚫 Pen miss"
                                  : event.type === "SHOOTOUT_SCORED"
                                    ? "✓ SO"
                                    : event.type === "SHOOTOUT_MISSED"
                                      ? "✗ SO"
                                      : event.type === "YELLOW_CARD"
                                        ? "🟨 Yel"
                                        : event.type === "RED_CARD"
                                          ? "🟥 Red"
                                          : event.type}
                        </span>
                        <span className="text-[#3f6b55] truncate">
                          - {event.player ? event.player.name : "Roster Player"}
                        </span>
                        <span className="text-[9px] text-slate-400 shrink-0">
                          ({isTeamA ? "H" : "A"})
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteEvent(event.id)}
                        className="text-slate-400 hover:text-red-500 p-2.5 cursor-pointer transition-colors ml-2 shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        title="Delete Event"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-16 text-xs font-mono text-slate-400">
                  No events recorded yet.
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 mt-3 text-[9px] font-mono text-slate-400 leading-relaxed">
              Own goals are credited to the opposing team&apos;s score but logged
              under the scoring player&apos;s roster name. They do not count
              toward Top Scorers.
            </div>
          </div>
        </section>
        </>
        )}
      </main>
    </div>
  );
}
