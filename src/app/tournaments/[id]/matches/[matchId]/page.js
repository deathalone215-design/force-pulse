"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
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

  const fetchData = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) setLoading(true);
        const res = await fetch(`/api/tournaments/${tournamentId}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Tournament not found");
        const data = await res.json();
        setTournament(data);

        const ctx = findMatchContext(data, matchId);
        if (!ctx) throw new Error("Match not found in this tournament");

        setSelectedEventTeamId((prev) => prev || ctx.match.teamAId);
        setError(null);
        return data;
      } catch (err) {
        setError(err.message);
        return null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [tournamentId, matchId]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const ctx = tournament ? findMatchContext(tournament, matchId) : null;
  const match = ctx?.match;

  const updateMatchStatus = async (newStatus) => {
    try {
      setUpdatingStatus(true);
      const res = await fetch(`/api/matches/${matchId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      await fetchData({ silent: true });
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!match) return;
    if (!eventPlayerId) {
      alert("Please select a player associated with the event.");
      return;
    }

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
        body: JSON.stringify({
          type: eventType,
          teamId: eventTeamId,
          playerId: eventPlayerId,
          minute: eventMinute ? parseInt(eventMinute, 10) : null,
        }),
      });

      if (!res.ok) throw new Error("Failed to record event");
      await fetchData({ silent: true });
      setEventPlayerId("");
      setEventMinute("");
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmittingEvent(false);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      const res = await fetch(
        `/api/matches/${matchId}/events?eventId=${eventId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete event");
      await fetchData({ silent: true });
    } catch (err) {
      alert(err.message);
    }
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

  const isCricket = tournament.sport === "CRICKET";

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
                    {isCricket ? "Cricket Scorer" : "Scorer Console"}
                  </span>
                  <span className="hidden sm:inline">
                    {isCricket
                      ? "Cricket Ball-by-Ball Scorer"
                      : "Live Match Scorer Console"}
                  </span>
                </h1>
              </div>
              <p className="text-[9px] sm:text-[10px] font-mono text-white/55 mt-0.5 truncate">
                {tournament.name}
                {isCricket && tournament.oversPerInnings
                  ? ` · ${tournament.oversPerInnings} overs`
                  : ""}
                {ctx.category ? ` · ${ctx.category.name}` : ""}
                {ctx.round
                  ? ` · ${getRoundName(ctx.round.number, ctx.totalRounds)}`
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
            match={match}
            matchId={matchId}
            onRefresh={() => fetchData({ silent: true })}
          />
        ) : null}

        {!isCricket && (
        <>
        {/* Scoreboard */}
        <section className="bg-[#0d472c] border-2 border-mustard-gold rounded-2xl p-4 sm:p-8 shadow-lg text-white">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5 sm:mb-6 border-b border-[#093c24] pb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono text-mustard-gold uppercase font-bold">
                Match State:
              </span>
              <select
                value={match.status}
                disabled={updatingStatus}
                onChange={(e) => updateMatchStatus(e.target.value)}
                className="bg-[#093c24] border border-white/25 text-[10px] font-mono text-white rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-mustard-gold outline-none cursor-pointer disabled:opacity-60 min-h-[40px]"
              >
                <option value="SCHEDULED">SCHEDULED</option>
                <option value="LIVE">LIVE</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
              {updatingStatus && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-mustard-gold" />
              )}
            </div>
            {match.status === "LIVE" && (
              <span className="text-[10px] text-red-400 font-mono font-bold animate-pulse flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                RECORDING EVENT LIVE
              </span>
            )}
            {match.status === "COMPLETED" && (
              <span className="text-[10px] text-mustard-gold/90 font-mono font-bold uppercase tracking-wider">
                Match completed · points locked
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
              Record Match Event
            </h3>

            <form onSubmit={handleAddEvent} className="space-y-4">
              <div>
                <label className="block text-[9px] font-mono text-[#0a331f]/60 uppercase tracking-wider mb-2">
                  Event Action Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "GOAL", label: "⚽ Goal" },
                    { id: "OWN_GOAL", label: "❌ Own Goal" },
                    { id: "YELLOW_CARD", label: "🟨 Yellow Card" },
                    { id: "RED_CARD", label: "🟥 Red Card" },
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
                  Select Team
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
                  Assign Roster Player
                </label>
                <select
                  required
                  value={eventPlayerId}
                  onChange={(e) => setEventPlayerId(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-3 text-xs text-deep-forest outline-none transition-all cursor-pointer shadow-sm"
                >
                  <option value="">-- Choose Roster Player --</option>
                  {playersForTeam.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (#{p.shirtNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono text-[#0a331f]/60 uppercase tracking-wider mb-2">
                  Occurrence Minute (Optional)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="1"
                    max="120"
                    placeholder="e.g. 78"
                    value={eventMinute}
                    onChange={(e) => setEventMinute(e.target.value)}
                    className="flex-1 bg-white border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-3 text-xs text-deep-forest outline-none transition-all shadow-sm"
                  />
                  <span className="text-xs font-mono text-slate-400">MINS</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submittingEvent}
                className="w-full bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase tracking-wider py-3.5 rounded-xl text-xs transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submittingEvent ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Logging Event...
                  </>
                ) : (
                  "Log Match Event"
                )}
              </button>
            </form>
          </div>

          <div className="bg-white border-2 border-dashed border-mustard-gold p-5 sm:p-6 rounded-2xl flex flex-col shadow-sm min-h-[360px]">
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0a331f]/60 border-b border-slate-100 pb-2 mb-3">
              Live Feed Log
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
                          {event.minute ? `${event.minute}'` : "--'"}
                        </span>
                        <span className="text-deep-forest shrink-0">
                          {event.type === "GOAL"
                            ? "⚽ Goal"
                            : event.type === "OWN_GOAL"
                              ? "❌ Own Goal"
                              : event.type === "YELLOW_CARD"
                                ? "🟨 Yel"
                                : "🟥 Red"}
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

        <div className="flex justify-center pb-4">
          <button
            type="button"
            onClick={goBack}
            disabled={isPending}
            className="text-[10px] font-mono font-bold uppercase tracking-wider text-deep-forest/50 hover:text-deep-forest transition-colors cursor-pointer"
          >
            ← Return to tournament dashboard
          </button>
        </div>
      </main>
    </div>
  );
}
