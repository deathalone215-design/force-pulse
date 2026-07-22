"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

/**
 * Subscribe to Match row changes for this tournament's fixtures.
 * On any INSERT/UPDATE/DELETE, call `onChange` (typically fetchDelta).
 * When matchIds is set, ignore changes for other tournaments' matches.
 */
export function useMatchRealtime({ enabled = true, onChange, matchIds = null } = {}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const matchIdsRef = useRef(matchIds);
  matchIdsRef.current = matchIds;

  useEffect(() => {
    if (!enabled) return undefined;

    const supabase = getSupabaseBrowser();
    if (!supabase) return undefined;

    let debounceTimer = null;
    const fire = (payload) => {
      const ids = matchIdsRef.current;
      if (ids && ids.size > 0) {
        const row = payload?.new || payload?.old;
        const changedId = row?.id;
        if (changedId && !ids.has(changedId)) return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onChangeRef.current?.();
      }, 150);
    };

    const channel = supabase
      .channel(`force-pulse-matches-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Match" },
        fire
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "MatchSet" },
        (payload) => {
          const matchId = payload?.new?.matchId || payload?.old?.matchId;
          const ids = matchIdsRef.current;
          if (ids && ids.size > 0 && matchId && !ids.has(matchId)) return;
          fire(payload);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "MatchEvent" },
        (payload) => {
          const matchId = payload?.new?.matchId || payload?.old?.matchId;
          const ids = matchIdsRef.current;
          if (ids && ids.size > 0 && matchId && !ids.has(matchId)) return;
          fire(payload);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "CricketBall" },
        (payload) => {
          const matchId = payload?.new?.matchId || payload?.old?.matchId;
          const ids = matchIdsRef.current;
          if (ids && ids.size > 0 && matchId && !ids.has(matchId)) return;
          fire(payload);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          fire();
        }
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [enabled]);
}
