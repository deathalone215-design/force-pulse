"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Trophy,
  Calendar,
  Users,
  Loader2,
  ShieldAlert,
  Tags,
  Radio,
  Activity,
  Clock,
} from "lucide-react";
import {
  hasTournamentDayStarted,
  isTournamentLiveNow,
  formatTournamentDate,
} from "@/lib/tournamentDate";

function teamCount(tournament) {
  if (!tournament?.categories) return 0;
  return tournament.categories.reduce(
    (sum, c) => sum + (c._count?.teams ?? c.teams?.length ?? 0),
    0
  );
}

/** @param {"live"|"ready"|"upcoming"} mode */
function TournamentCard({ t, mode }) {
  const isLive = mode === "live";
  const isReady = mode === "ready";
  const canOpen = isLive || isReady;

  const footerLabel = isLive ? (
    <>
      <Activity className="w-3.5 h-3.5" />
      {t.liveMatchCount} match{t.liveMatchCount === 1 ? "" : "es"} live — open board
    </>
  ) : isReady ? (
    <>
      <Radio className="w-3.5 h-3.5" />
      Match day — waiting for kickoff
    </>
  ) : (
    <>
      <Clock className="w-3.5 h-3.5" />
      Live from {formatTournamentDate(t.startDate)}
    </>
  );

  const cardBody = (
    <>
      <div className="absolute top-0 left-0 w-1.5 h-full bg-mustard-gold transform -translate-y-full group-hover:translate-y-0 transition-transform duration-300" />

      <div className="flex justify-between items-start gap-3 mb-5 sm:mb-6">
        <div className="flex items-center gap-3 min-w-0">
          {t.logoUrl ? (
            <img
              src={t.logoUrl}
              alt=""
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover border-2 border-mustard-gold/60 shadow-sm shrink-0"
            />
          ) : (
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-cream-bg border border-slate-200 flex items-center justify-center shrink-0">
              <Trophy className="w-6 h-6 text-mustard-gold" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {isLive && (
                <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider text-red-700 bg-red-50 border border-red-200 rounded-md px-1.5 py-0.5 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                  Live now
                </span>
              )}
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-deep-forest group-hover:text-mustard-gold-hover transition-colors leading-snug font-display tracking-wide uppercase truncate">
              {t.name}
            </h3>
            <div className="flex flex-wrap gap-1 mt-1.5">
              <span className="inline-flex items-center text-[9px] font-mono font-bold uppercase tracking-wider text-deep-forest bg-[#0d472c]/10 border border-[#0d472c]/20 rounded-md px-1.5 py-0.5">
                {t.sport === "CRICKET"
                  ? `Cricket · ${t.oversPerInnings || "?"} ov`
                  : "Football"}
              </span>
              {(t.categories || []).map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider text-mustard-gold-hover bg-mustard-gold/15 border border-mustard-gold/40 rounded-md px-1.5 py-0.5"
                >
                  <Tags className="w-2.5 h-2.5" />
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div
          className={`p-2 rounded-xl border shrink-0 ${
            isLive
              ? "bg-red-50 border-red-200 text-red-700"
              : canOpen
                ? "bg-cream-bg border-slate-200 group-hover:bg-mustard-gold group-hover:border-mustard-gold"
                : "bg-slate-50 border-slate-200"
          }`}
        >
          {isLive ? (
            <Activity className="w-4 h-4 animate-pulse" />
          ) : canOpen ? (
            <Radio className="w-4 h-4" />
          ) : (
            <Clock className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between text-[10px] font-mono text-deep-forest/60 border-t border-slate-100 pt-4 gap-4">
        <div className="flex items-center gap-1.5 bg-cream-bg border border-slate-200/60 rounded-md px-2 py-1">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>{formatTournamentDate(t.startDate)}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-cream-bg border border-slate-200/60 rounded-md px-2 py-1">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-deep-forest font-bold">{teamCount(t)} Club(s)</span>
        </div>
      </div>

      <div
        className={`mt-4 flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-wider ${
          isLive
            ? "text-red-700"
            : canOpen
              ? "text-mustard-gold-hover"
              : "text-deep-forest/45"
        }`}
      >
        {footerLabel}
      </div>
    </>
  );

  if (canOpen) {
    return (
      <Link
        href={`/live/${t.id}`}
        className={`group flex flex-col bg-white border-2 border-dashed rounded-2xl p-4 sm:p-6 transition-all duration-300 shadow-sm relative overflow-hidden hover:border-solid hover:shadow-md ${
          isLive ? "border-red-300 ring-1 ring-red-100" : "border-mustard-gold"
        }`}
      >
        {cardBody}
      </Link>
    );
  }

  return (
    <div className="group flex flex-col bg-white border-2 border-dashed border-slate-300 rounded-2xl p-4 sm:p-6 shadow-sm relative overflow-hidden opacity-95">
      {cardBody}
    </div>
  );
}

export default function PublicHome() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async ({ silent = false } = {}) => {
      try {
        if (!silent) setLoading(true);
        const res = await fetch("/api/tournaments", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load tournaments");
        const data = await res.json();
        if (!cancelled) {
          setTournaments(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    };

    load();
    // Poll so public home picks up when admin sets a match LIVE
    const timer = setInterval(() => load({ silent: true }), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const liveTournaments = tournaments.filter((t) => isTournamentLiveNow(t));
  const matchDayWaiting = tournaments.filter(
    (t) => hasTournamentDayStarted(t) && !isTournamentLiveNow(t)
  );
  const upcomingTournaments = tournaments.filter(
    (t) => !hasTournamentDayStarted(t)
  );

  return (
    <div className="flex flex-col min-h-screen bg-cream-bg text-deep-forest font-sans selection:bg-mustard-gold selection:text-deep-forest overflow-x-hidden relative">
      <header className="pitch-stripes border-b-4 border-mustard-gold/80 shadow-md relative overflow-hidden min-h-[34vh] sm:min-h-[42vh] flex items-end">
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent pointer-events-none" />
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(229,169,59,0.35), transparent 45%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.12), transparent 40%)",
          }}
        />

        <div className="max-w-6xl w-full mx-auto px-4 relative z-10 pb-8 sm:pb-12 pt-12 sm:pt-16 space-y-4 sm:space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-mustard-gold font-mono text-[10px] sm:text-xs font-bold uppercase tracking-widest">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Live
            </span>
            <span className="text-white/50">•</span>
            <span>Public Board</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-display uppercase tracking-normal text-white drop-shadow-lg">
            FORCEPLUS
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-white/85 font-medium max-w-xl leading-relaxed">
            Follow live scores, fixtures, points tables, and top scorers.
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 sm:py-12 relative z-10 space-y-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white border-2 border-dashed border-mustard-gold rounded-2xl gap-4 shadow-sm">
            <Loader2 className="w-8 h-8 animate-spin text-mustard-gold" />
            <p className="text-xs font-mono text-deep-forest/50">Loading tournaments...</p>
          </div>
        ) : error ? (
          <div className="p-5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs text-center font-mono flex items-center justify-center gap-2">
            <ShieldAlert className="w-4 h-4" /> {error}
          </div>
        ) : tournaments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 bg-white border-2 border-dashed border-mustard-gold rounded-2xl gap-4 text-center px-6 shadow-sm">
            <Trophy className="w-12 h-12 text-slate-300" />
            <h3 className="text-sm font-bold text-deep-forest uppercase tracking-wider font-mono">
              No tournaments yet
            </h3>
            <p className="text-xs text-deep-forest/60 max-w-sm leading-relaxed">
              Check back when tournament kicks off.
            </p>
          </div>
        ) : (
          <>
            {/* LIVE — Jul 18+ AND admin set a match LIVE */}
            <section className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xs font-bold tracking-widest uppercase font-mono text-deep-forest/60">
                  Live tournaments
                </h2>
                <span className="text-[10px] font-mono text-deep-forest bg-white border border-dashed border-mustard-gold rounded-full px-3.5 py-1 font-bold shadow-sm">
                  {liveTournaments.length} live
                </span>
              </div>

              {liveTournaments.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl py-12 text-center px-6">
                  <Radio className="w-9 h-9 text-slate-300 mx-auto mb-3" />
                  <p className="text-xs font-mono text-deep-forest/55">
                    No matches live right now
                  </p>
                  <p className="text-[10px] font-mono text-deep-forest/40 mt-2 max-w-sm mx-auto">
                    On tournament day, live boards appear here when an admin
                    sets a match to LIVE.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {liveTournaments.map((t) => (
                    <TournamentCard key={t.id} t={t} mode="live" />
                  ))}
                </div>
              )}
            </section>

            {/* Match day board open, but admin hasn&apos;t started a LIVE match yet */}
            {matchDayWaiting.length > 0 && (
              <section className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xs font-bold tracking-widest uppercase font-mono text-deep-forest/60">
                    Match day
                  </h2>
                  <span className="text-[10px] font-mono text-deep-forest/70 bg-cream-bg border border-slate-200 rounded-full px-3.5 py-1 font-bold">
                    {matchDayWaiting.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {matchDayWaiting.map((t) => (
                    <TournamentCard key={t.id} t={t} mode="ready" />
                  ))}
                </div>
              </section>
            )}

            {/* Before Jul 18 */}
            {upcomingTournaments.length > 0 && (
              <section className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xs font-bold tracking-widest uppercase font-mono text-deep-forest/60">
                    Upcoming
                  </h2>
                  <span className="text-[10px] font-mono text-deep-forest/70 bg-cream-bg border border-slate-200 rounded-full px-3.5 py-1 font-bold">
                    {upcomingTournaments.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {upcomingTournaments.map((t) => (
                    <TournamentCard key={t.id} t={t} mode="upcoming" />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-8 text-center text-[10px] font-mono text-slate-400 tracking-wider">
        © 2026 MATCH DAY · SPECTATOR VIEW
      </footer>
    </div>
  );
}
