"use client";

import { TicketIcon } from "lucide-react";

import { BetSlipPanel } from "@/components/bet/bet-slip-panel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCoins } from "@/lib/format";

/**
 * The mobile half of the bet slip dock, split out so it can be code-split (9.5).
 *
 * `Sheet` is a Radix Dialog, and mounting it from the shell put the whole
 * dialog implementation — focus trap, portal, dismissable layer — into the
 * first script every page downloads, including the lobby, where there is no
 * slip to open. `BetSlipDock` now loads this chunk the moment the slip stops
 * being empty, which is well before anyone can reach for the trigger.
 */
export default function BetSlipSheet({
  open,
  onOpenChange,
  count,
  totalStake,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  totalStake: number;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // Capped so the markets behind stay visible while a stake is typed.
        className="border-primary/25 max-h-[85svh] gap-0 rounded-t-2xl p-0 pt-1.5 xl:hidden"
      >
        {/* Grab handle: the affordance that says this sheet is draggable-ish
            and, more usefully, gives the thumb somewhere safe to land. */}
        <span
          aria-hidden
          className="bg-muted-foreground/40 mx-auto mb-1 h-1 w-10 shrink-0 rounded-full"
        />

        <SheetHeader className="border-b px-4 pt-2 pb-3">
          <SheetTitle className="flex items-center gap-2">
            <TicketIcon className="text-primary size-4" aria-hidden />
            Bet slip
            <span className="text-muted-foreground text-sm font-normal tabular-nums">
              {count} selection{count === 1 ? "" : "s"} · {formatCoins(totalStake)} coins
            </span>
          </SheetTitle>
        </SheetHeader>

        <BetSlipPanel onPlaced={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
