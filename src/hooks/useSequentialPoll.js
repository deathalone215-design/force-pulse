"use client";

import { useEffect, useRef } from "react";

/**
 * Poll without pile-up: next tick only runs after the previous fetch settles.
 * Pauses while the tab is hidden.
 */
export function useSequentialPoll(callback, intervalMs, { enabled = true } = {}) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let timer = null;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, intervalMs);
        return;
      }
      try {
        await callbackRef.current();
      } catch {
        /* caller handles errors */
      }
      if (!cancelled) {
        timer = setTimeout(tick, intervalMs);
      }
    };

    timer = setTimeout(tick, intervalMs);

    const onVisible = () => {
      if (!document.hidden && !cancelled) {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}
