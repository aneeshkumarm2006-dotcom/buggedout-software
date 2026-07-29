"use client";

import { useEffect, useState } from "react";

import { formatDuration } from "@/lib/format";

/**
 * Ticks down to a start time or a market's close (Phase 5.3, 5.4).
 *
 * The interval follows the number on screen: once a minute while the target is
 * more than an hour out, once a second in the final stretch. A card sitting in
 * a list of twenty shouldn't re-render every second to redraw "3d 4h".
 *
 * The first value is computed in the state initialiser, which runs on the
 * server and again during hydration — a second's drift between the two clocks
 * is not a real mismatch, hence `suppressHydrationWarning`. Everything after
 * that comes from the timer, so nothing pushes state from an effect body.
 */
export function Countdown({
  target,
  prefix,
  endedLabel = "Started",
  className,
}: {
  /** ISO 8601 instant to count down to. */
  target: string;
  prefix?: string;
  /** Shown once the target has passed. */
  endedLabel?: string;
  className?: string;
}) {
  const [remaining, setRemaining] = useState(() => msUntil(target));

  useEffect(() => {
    // A fresh timeout per tick rather than one interval: the cadence itself
    // changes as the target gets closer. The first one is always a second out,
    // which is also what resyncs the display if `target` ever changes.
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const left = msUntil(target);
      setRemaining(left);
      if (left <= 0) return;

      timer = setTimeout(tick, left > ONE_HOUR_MS ? 60_000 : 1_000);
    };

    timer = setTimeout(tick, 1_000);

    return () => clearTimeout(timer);
  }, [target]);

  return (
    <span className={className} suppressHydrationWarning>
      {remaining <= 0 ? endedLabel : `${prefix ? `${prefix} ` : ""}${formatDuration(remaining)}`}
    </span>
  );
}

const ONE_HOUR_MS = 3_600_000;

function msUntil(target: string): number {
  return new Date(target).getTime() - Date.now();
}
