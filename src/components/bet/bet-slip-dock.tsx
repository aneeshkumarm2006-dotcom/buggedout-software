"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { TicketIcon } from "lucide-react";

import { BetSlipPanel } from "@/components/bet/bet-slip-panel";
import { useBetSlip } from "@/components/bet/bet-slip-provider";
import { formatCoins } from "@/lib/format";

/**
 * Where the bet slip lives on screen (Phase 5.5, styled in 7.3/7.4).
 *
 * Two frames around one panel: a bottom sheet reached from a floating,
 * thumb-height trigger below `xl`, and a permanent right-hand rail above it.
 * Both are mounted from the shell so the slip follows the user from match to
 * match instead of unmounting with the page that opened it.
 *
 * The sheet is code-split (9.5). It is only reachable once the slip has
 * something in it, so its chunk is fetched on the first selection rather than
 * on every page load — which on the lobby meant shipping a dialog nobody could
 * open. Loading it on `count > 0` rather than on the tap means it is already
 * there by the time a thumb reaches the trigger.
 */
const BetSlipSheet = dynamic(() => import("@/components/bet/bet-slip-sheet"), { ssr: false });
export function BetSlipDock() {
  const { count, totalStake } = useBetSlip();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile / tablet: trigger + bottom sheet. */}
      {count > 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          // Bottom-right, one thumb-width above the 64px tab bar and clear of
          // the home indicator — the corner a thumb already rests in, rather
          // than the middle of the screen where it would cover a market. The
          // tab bar is gone from `lg`, so the trigger drops to meet it.
          className="bg-primary text-primary-foreground glow-primary-lg animate-slip-in fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex h-12 items-center gap-2 rounded-full pr-2 pl-4 text-sm font-semibold transition-transform active:translate-y-px lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] xl:hidden"
        >
          <TicketIcon className="size-4.5" aria-hidden />
          Bet slip
          <span className="bg-primary-foreground/20 flex h-8 min-w-8 items-center justify-center rounded-full px-2 tabular-nums">
            {count}
          </span>
          <span className="sr-only">
            — {count} selection{count === 1 ? "" : "s"}, {formatCoins(totalStake)} coins staked
          </span>
        </button>
      ) : null}

      {count > 0 ? (
        <BetSlipSheet
          open={open}
          onOpenChange={setOpen}
          count={count}
          totalStake={totalStake}
        />
      ) : null}

      {/* Desktop: the rail the content column is padded to clear. */}
      <aside
        aria-label="Bet slip"
        className="bg-sidebar fixed inset-y-0 right-0 z-30 hidden w-80 flex-col border-l xl:flex"
      >
        <div className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <TicketIcon className="text-primary size-4" aria-hidden />
          <span className="font-heading text-sm font-semibold tracking-[0.06em] uppercase">
            Bet slip
          </span>
          {count > 0 ? (
            <span className="bg-primary/15 text-primary ring-primary/25 ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset">
              {count}
            </span>
          ) : null}
        </div>

        <BetSlipPanel />
      </aside>
    </>
  );
}
