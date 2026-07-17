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
} from "@/lib/footballClock";
import {
  mergeMatchFromApi,
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

const getRoundName = (number, totalRounds, format) =>
  getRoundDisplayName(number, totalRounds, format);

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

function TeamCrest({ team, size = "lg" }) {
  const sizes = {
    md: "w-12 h-12 sm:w-14 sm:h-14 text-sm",
    lg: "w-14 h-14 sm:w-20 sm:h-24 text-base sm:text-xl",
  };
  if (team?.logoUrl) {
    return (
      <img
        src={team.logoUrl}
        alt={team.name}
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
  // Ignore late full-tournament GETs; prefer match-scoped refresh after load.
  const fetchGenRef = useRef(0);
  const deletedEventIdsRef = useRef(new Set());
  const pendingWritesRef = useRef(0);

  /** Initial load only — full tournament for category / round context. */
  const fetchTournament = useCallback(
    async ({ silent = false } = {}) => {
      const gen = ++fetchGenRef.current;
      try {
        if (!silent) setLoading(true);
        const res = await fetch(`/api/tournaments/${tournamentId}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Tournament not found");
        const data = await res.json();
        if (gen !== fetchGenRef.current) return null;

        setTournament((prev) => {
          if (!prev) {
            return stripDeletedEvents(data, deletedEventIdsRef.current);
          }
          // Versioned merge: never let a stale full GET clobber the active match.
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
          if (!shouldAcceptServerMatch(local, data)) return local;
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

  // Football live clock tick (freeze while paused for injury / interruption)
  useEffect(() => {
    if (!match || match.status !== "LIVE" || !match.kickoffAt) return undefined;
    if (isFootballClockPaused(match)) return undefined;
    const id = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [match?.status, match?.kickoffAt, match?.clockPausedAt]);

  const clockOpts = footballClockOpts(match);
  const clockPaused = isFootballClockPaused(match);
  const footballClock =
    match?.kickoffAt != null
      ? formatFootballClock(
          footballElapsedSeconds(match.kickoffAt, clockNow, clockOpts)
        )
      : "00:00";
  const suggestedMinute =
    match?.kickoffAt != null
      ? footballMatchMinute(match.kickoffAt, clockNow, clockOpts)
      : null;

  const applyMatchUpdate = useCallback(
    (update, { addEvent, removeEventId, force = true } = {}) => {
      // Invalidate in-flight full tournament GETs.
      fetchGenRef.current += 1;
      setTournament((prev) =>
        patchMatchInTournament(prev, matchId, (m) => {
          const stamped = {
            ...update,
            // Optimistic version so stale GETs lose the race.
            updatedAt: update?.updatedAt || new Date().toISOString(),
          };
          let next = mergeMatchFromApi(m, stamped, { force });
          if (addEvent) {
            next = {
              ...next,
              events: [
                addEvent,
                ...(m.events || []).filter((e) => e.id !== addEvent.id),
              ],
            };
          }
          if (removeEventId) {
            next = {
              ...next,
              events: (next.events || m.events || []).filter(
                (e) => e.id !== removeEventId
              ),
            };
          }
          return next;
        })
      );
    },
    [matchId]
  );

  const withWrite = useCallback(async (fn) => {
    pendingWritesRef.current += 1;
    try {
      return await fn();
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
  }, []);

  const lockClaimedRef = useRef(false);
  useEffect(() => {
    if (!matchId || !match || lockClaimedRef.current) return undefined;
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
            ...casFields(match, matchId),
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
  }, [matchId, match, applyMatchUpdate]);

  const updateMatchStatus = async (newStatus, { resetClock = false } = {}) => {
    if (updatingStatus) return;
    if (match?.status === newStatus && !resetClock) return;
    await withWrite(async () => {
      try {
        setUpdatingStatus(true);
        const nextKickoff =
          newStatus === "SCHEDULED"
            ? null
            : newStatus === "LIVE" && (!match?.kickoffAt || resetClock)
              ? new Date().toISOString()
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
          ...(resetClock ? { clockPausedAt: null, pausedSeconds: 0 } : {}),
        });
        if (nextKickoff) setClockNow(Date.now());
        const res = await fetch(`/api/matches/${matchId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: newStatus,
            resetClock,
            ...casFields(match, matchId),
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
    if (!window.confirm("Reset the clock to 00:00?")) return;
    try {
      setResettingClock(true);
      await updateMatchStatus("LIVE", { resetClock: true });
    } finally {
      setResettingClock(false);
    }
  };

  const openClockEditor = () => {
    if (match?.status !== "LIVE" || updatingStatus || savingClock) return;
    setClockInput(footballClock || "00:00");
    setEditingClock(true);
  };

  const saveClockTime = async () => {
    const raw = String(clockInput || "").trim();
    if (!/^\d{1,3}\s*:\s*\d{1,2}$/.test(raw)) {
      alert("Enter time like 12:30");
      return;
    }
    await withWrite(async () => {
      try {
        setSavingClock(true);
        const res = await fetch(`/api/matches/${matchId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setClock: raw, ...casFields(match, matchId) }),
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
          status: data.status || "LIVE",
          updatedAt: data.updatedAt,
          version: data.version,
        });
        setClockNow(Date.now());
        setEditingClock(false);
      } catch (err) {
        alert(err.message);
        await refreshMatch();
      } finally {
        setSavingClock(false);
      }
    });
  };

  const setStoppageMinutes = async (value) => {
    const n = Math.max(0, Math.min(30, parseInt(value, 10) || 0));
    await withWrite(async () => {
      applyMatchUpdate({ stoppageMinutes: n });
      try {
        const res = await fetch(`/api/matches/${matchId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stoppageMinutes: n,
            ...casFields(match, matchId),
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
            ...casFields(match, matchId),
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
    if (!match) return;
    if (!eventPlayerId) {
      alert("Please select a player associated with the event.");
      return;
    }

    await withWrite(async () => {
      try {
        setSubmittingEvent(true);

        let eventTeamId = null;
        const teamA = match.teamA;
        const teamB = match.teamB;

        if (teamA?.players?.some((p) => p.id === eventPlayerId)) {
          eventTeamId = teamA.id;
        } else if (teamB?.players?.some((p) => p.id === eventPlayerId)) {
          eventTeamId = teamB.id;
        } else {
          eventTeamId = selectedEventTeamId || teamA?.id;
        }

        const res = await fetch(`/api/matches/${matchId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            type: eventType,
            teamId: eventTeamId,
            playerId: eventPlayerId,
            minute: eventMinute
              ? parseInt(eventMinute, 10)
              : suggestedMinute,
            ...casFields(match, matchId),
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (isCasConflict(res, data) && data?.match) {
            applyMatchUpdate(data.match);
          }
          throw new Error(casErrorMessage(res, data, "Failed to record event"));
        }

        if (data.match) {
          applyMatchUpdate(data.match, { addEvent: data.event });
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
            ...casFields(match, matchId),
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
                {category ? ` · ${category.name}` : ""}
                {ctx.round
                  ? ` · ${getRoundName(
                      ctx.round.number,
                      ctx.totalRounds,
                      category?.scheduleFormat
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
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
                {editingClock ? (
                  <div className="flex items-center gap-2 bg-[#093c24] border border-mustard-gold rounded-xl px-3 py-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      value={clockInput}
                      onChange={(e) => setClockInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveClockTime();
                        if (e.key === "Escape") setEditingClock(false);
                      }}
                      placeholder="MM:SS"
                      className="w-[5.5rem] bg-transparent text-2xl font-mono font-bold text-mustard-gold tabular-nums outline-none text-center"
                    />
                    <button
                      type="button"
                      disabled={savingClock}
                      onClick={saveClockTime}
                      className="text-xs font-bold bg-mustard-gold text-[#0d472c] rounded-lg px-3 py-2 cursor-pointer disabled:opacity-50"
                    >
                      {savingClock ? "…" : "Set"}
                    </button>
                    <button
                      type="button"
                      disabled={savingClock}
                      onClick={() => setEditingClock(false)}
                      className="text-xs font-bold text-white/70 border border-white/20 rounded-lg px-3 py-2 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openClockEditor}
                    title="Tap to set time"
                    className={`flex items-center justify-center gap-2 bg-[#093c24] border rounded-xl px-4 py-2 cursor-pointer hover:bg-[#0a331f] transition-colors ${
                      clockPaused
                        ? "border-amber-400/70"
                        : "border-mustard-gold/40"
                    }`}
                  >
                    <span className="text-[8px] font-mono uppercase tracking-widest text-white/45">
                      {clockPaused ? "Paused" : "Time"}
                    </span>
                    <span
                      className={`text-2xl font-mono font-bold tabular-nums tracking-wider ${
                        clockPaused ? "text-amber-300" : "text-mustard-gold"
                      }`}
                    >
                      {footballClock}
                    </span>
                    <span className="text-[9px] font-mono text-white/40 hidden sm:inline">
                      tap to set
                    </span>
                  </button>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={toggleFootballClockPause}
                    disabled={updatingStatus || !match.kickoffAt || editingClock}
                    className={`text-xs font-bold rounded-lg px-3 py-2 border cursor-pointer disabled:opacity-50 min-h-[40px] ${
                      clockPaused
                        ? "text-emerald-300 border-emerald-400/50 hover:bg-emerald-400/10"
                        : "text-amber-300 border-amber-400/50 hover:bg-amber-400/10"
                    }`}
                  >
                    {clockPaused ? "Resume" : "Pause"}
                  </button>
                  <button
                    type="button"
                    onClick={resetFootballClock}
                    disabled={resettingClock || updatingStatus || editingClock}
                    className="text-xs font-bold text-mustard-gold border border-mustard-gold/40 rounded-lg px-3 py-2 hover:bg-mustard-gold/10 cursor-pointer disabled:opacity-50 min-h-[40px]"
                  >
                    {resettingClock ? "…" : "Reset"}
                  </button>
                  <div className="flex items-center gap-1.5 bg-[#093c24] border border-white/15 rounded-xl px-2 py-1.5">
                    <span className="text-[8px] font-mono uppercase text-white/45 tracking-wider px-1">
                      Extra
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setStoppageMinutes((match.stoppageMinutes || 0) - 1)
                      }
                      className="w-8 h-8 rounded-lg bg-white/10 text-white font-bold cursor-pointer hover:bg-white/20"
                    >
                      −
                    </button>
                    <span className="text-sm font-mono font-bold text-mustard-gold tabular-nums min-w-[2.5rem] text-center">
                      +{match.stoppageMinutes || 0}&apos;
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setStoppageMinutes((match.stoppageMinutes || 0) + 1)
                      }
                      className="w-8 h-8 rounded-lg bg-white/10 text-white font-bold cursor-pointer hover:bg-white/20"
                    >
                      +
                    </button>
                  </div>
                </div>

                {clockPaused ? (
                  <span className="text-xs text-amber-300 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Paused
                  </span>
                ) : match.kickoffAt ? (
                  <span className="text-xs text-red-400 font-bold animate-pulse flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    Live
                  </span>
                ) : (
                  <span className="text-xs text-red-400 font-bold animate-pulse flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    Starting…
                  </span>
                )}
              </div>
            )}

            {match.status === "COMPLETED" && (
              <span className="text-xs text-mustard-gold/90 font-bold">
                Match finished
                {match.kickoffAt
                  ? ` · ${formatFootballClock(
                      footballElapsedSeconds(
                        match.kickoffAt,
                        clockNow,
                        footballClockOpts(match)
                      )
                    )}`
                  : ""}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 items-center gap-2 sm:gap-6 text-center">
            <div className="flex flex-col items-center gap-2 sm:gap-3 min-w-0">
              <TeamCrest team={match.teamA} />
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
              <TeamCrest team={match.teamB} />
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
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "GOAL", label: "⚽ Goal" },
                    { id: "OWN_GOAL", label: "❌ Own goal" },
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
