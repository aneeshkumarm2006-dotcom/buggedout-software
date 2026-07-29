"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A CSS media query as React state — `false` while rendering on the server,
 * then the browser's real answer, and it re-renders when that answer changes.
 *
 * Same shape as `useHydrated` and for the same reason: React is handed both
 * snapshots up front and schedules the swap itself, rather than us pushing
 * state from an effect (which `react-hooks/set-state-in-effect` rejects, and
 * which would render once with the wrong answer either way).
 *
 * Used by 8.3 to keep the animated cards off touch screens entirely: a device
 * that cannot hover never mounts a `<video>`, so it never fetches one.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
