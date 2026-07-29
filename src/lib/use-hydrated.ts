"use client";

import { useSyncExternalStore } from "react";

/**
 * `false` while rendering on the server and during hydration, `true` from the
 * first client render onwards.
 *
 * The honest way to render something that only the browser can know — the
 * viewer's timezone, say. `useSyncExternalStore` gives React both snapshots up
 * front, so it schedules the swap itself instead of us pushing state from an
 * effect and triggering a cascading render.
 */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
