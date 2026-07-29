"use client";

import { useEffect, useRef, useState } from "react";

import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A coin total that rolls to its new value instead of jumping (Phase 7.5).
 *
 * Placing a bet, claiming the daily bonus and settling a win all end in
 * `router.refresh()`, which re-renders the server component holding the balance
 * and hands this one a new `value`. Because the client component *instance*
 * survives that refresh, it still knows the old number — so the change can be
 * animated without the server having to send both.
 *
 * The count is the whole effect: no separate flash state to get out of sync,
 * because "still counting" is simply `display !== value`, and counting *up* is
 * `display < value`. Those two drive the colour and the small swell as well.
 */
export function CoinCounter({
  value,
  className,
  /** Roughly how long the roll takes. Longer looks broken, shorter isn't seen. */
  durationMs = 650,
}: {
  value: number;
  className?: string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(value);
  // Where the *pixels* are, which is not `value` while a roll is in flight and
  // not `display` at the moment a second change interrupts the first.
  const displayRef = useRef(value);

  useEffect(() => {
    const from = displayRef.current;
    if (from === value) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // A first paint after a hard refresh has nothing to count from, and a
    // reduced-motion user asked for no journey — both land on the number.
    if (reduceMotion || Math.abs(value - from) < 2) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    let frame = 0;
    let start = 0;

    const tick = (now: number) => {
      // The first callback carries the *frame's* timestamp, which can predate
      // the `performance.now()` at scheduling time. Seeding from the first tick
      // rather than from before it is what stops the total dipping below where
      // it started for one frame on the way up.
      if (start === 0) start = now;

      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic: fast off the mark, settles onto the final digit.
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(from + (value - from) * eased);

      displayRef.current = next;
      setDisplay(next);

      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, value]);

  const rolling = display !== value;
  const gaining = rolling && display < value;

  return (
    <span
      className={cn(
        "inline-block tabular-nums transition-[color,transform] duration-200",
        gaining && "text-win scale-110",
        className,
      )}
    >
      {/* A screen reader gets the number, once — announcing every frame of the
          roll would be unusable. */}
      <span aria-hidden>{formatCoins(display)}</span>
      <span className="sr-only">{formatCoins(value)}</span>
    </span>
  );
}
