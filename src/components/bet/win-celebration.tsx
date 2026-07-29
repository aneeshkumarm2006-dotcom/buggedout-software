"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { RecentWin } from "@/lib/bet-history";
import { formatCoins } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * The win celebration on My Bets (Phase 7.5), built around `hud-winner.webp`.
 *
 * That asset is a HUD bezel with a genuinely transparent screen cut into it —
 * measured at 27.43% / 29.45% of the 1400×781 frame, 43.71% wide and 42.13%
 * tall — so the payout is laid *under* the image and shows through the hole,
 * with the bezel's edges overlapping it the way they would on a real broadcast
 * overlay. Those four numbers are hard-coded on purpose: they belong to this
 * one image, and re-deriving them at runtime would cost a canvas read for
 * something that cannot change.
 *
 * Which wins have already been celebrated is kept in `localStorage`. It is a
 * presentation detail — a fanfare, not a fact about the account — so it does
 * not belong in the ledger, and putting it there would mean a schema change
 * plus a write on every read of this page.
 */

/** The measured hole in the bezel, as CSS percentages of the frame. */
const SCREEN = {
  left: "27.43%",
  top: "29.45%",
  width: "43.71%",
  height: "42.13%",
} as const;

const STORAGE_KEY = "buggedout.celebrated-bets";
/** Comfortably outlives the 72h window `getRecentWins` looks back over. */
const REMEMBER_LIMIT = 200;

export function WinCelebration({ wins }: { wins: RecentWin[] }) {
  const hydrated = useHydrated();
  const [dismissed, setDismissed] = useState(false);

  // Read during render rather than pushed in from an effect: `useHydrated()`
  // hands React both snapshots, so the server renders nothing and the browser
  // renders the answer on its first pass — no setState cascade, and no
  // hydration mismatch over a value the server could never have known.
  const celebrated = hydrated ? readCelebrated() : null;
  const fresh = celebrated ? wins.filter((win) => !celebrated.has(win.id)) : [];

  if (dismissed || fresh.length === 0) return null;

  const headline = fresh[0]!;
  const total = fresh.reduce((sum, win) => sum + win.payout, 0);
  const amount = formatCoins(total);

  function close() {
    remember(fresh.map((win) => win.id));
    setDismissed(true);
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="animate-win-flare border-win/25 gap-0 overflow-hidden border bg-transparent p-0 shadow-[0_0_80px_-24px_var(--win)] sm:max-w-md"
      >
        <div className="bg-popover relative">
          {/* Decorative only, and the first thing reduced-motion switches off
              (the rule lives in globals.css). */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[62%] z-20 h-0"
          >
            {SPARKS.map((spark) => (
              <span
                key={spark.left}
                className="bg-win animate-spark absolute size-1.5 rounded-full"
                style={
                  {
                    left: spark.left,
                    "--spark-x": spark.drift,
                    animationDelay: spark.delay,
                  } as React.CSSProperties
                }
              />
            ))}
          </span>

          <div className="relative">
            {/* Under the bezel, showing through the cut-out screen. Its own
                container, so the payout is sized against the hole it has to fit
                in rather than against the frame around it. */}
            <div
              className="@container absolute flex flex-col items-center justify-center text-center"
              style={SCREEN}
            >
              <span className="text-brand-gold text-[7cqw] leading-tight font-semibold tracking-[0.16em] uppercase">
                You won
              </span>
              <span
                className="font-heading text-win leading-none font-extrabold tabular-nums drop-shadow-[0_0_14px_var(--win)]"
                style={{ fontSize: payoutFontSize(amount) }}
              >
                {amount}
              </span>
              <span className="text-foreground/75 text-[6.5cqw] leading-tight font-medium tracking-[0.14em] uppercase">
                coins
              </span>
            </div>

            <Image
              src="/hud-winner.webp"
              alt=""
              width={1400}
              height={781}
              loading="eager"
              fetchPriority="high"
              className="pointer-events-none relative h-auto w-full select-none"
            />
          </div>

          <div className="space-y-3 px-5 pt-1 pb-5 text-center">
            <div className="space-y-1">
              <DialogTitle className="font-heading text-lg font-bold">
                {fresh.length === 1 ? "Your bet came in" : `${fresh.length} bets came in`}
              </DialogTitle>
              <DialogDescription>
                {fresh.length === 1 ? "" : "Starting with "}
                <span className="text-foreground font-medium">{headline.optionName}</span>
                {fresh.length === 1 ? " won on " : " on "}
                {headline.matchTitle}.
              </DialogDescription>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
              <Button variant="outline" size="lg" onClick={close}>
                Nice
              </Button>
              <Button asChild size="lg" className="glow-primary" onClick={close}>
                <Link href={`/matches/${headline.matchId}`}>See the match</Link>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The screen is a fixed hole, so the number has to come to it. Container-query
 * units keep this proportional at every dialog width; the digit count picks
 * which proportion, so `900` fills the screen and `1,250,000` still fits in it.
 */
function payoutFontSize(amount: string): string {
  if (amount.length <= 5) return "24cqw";
  if (amount.length <= 7) return "19cqw";
  if (amount.length <= 9) return "15cqw";
  return "12cqw";
}

/** Fixed offsets — a random scatter would differ between renders for no gain. */
const SPARKS = [
  { left: "12%", drift: "-1.5rem", delay: "0ms" },
  { left: "26%", drift: "1rem", delay: "180ms" },
  { left: "44%", drift: "-0.75rem", delay: "90ms" },
  { left: "58%", drift: "1.75rem", delay: "260ms" },
  { left: "73%", drift: "-1.25rem", delay: "40ms" },
  { left: "88%", drift: "0.5rem", delay: "320ms" },
];

function readCelebrated(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    // Private mode, a full quota, or somebody's hand-edited JSON. A celebration
    // that fires twice is a better failure than a page that doesn't render.
    return new Set();
  }
}

function remember(ids: string[]): void {
  try {
    const next = [...new Set([...ids, ...readCelebrated()])].slice(0, REMEMBER_LIMIT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // See above.
  }
}
