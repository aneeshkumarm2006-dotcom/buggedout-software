"use client";

import { Loader2Icon, TicketIcon, Trash2Icon, XIcon } from "lucide-react";

import { useBetSlip, type BetSlipRow } from "@/components/bet/bet-slip-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCoins, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The bet slip's contents (Phase 5.5, styled in 7.3) — selections, per-bet
 * stake, potential winnings, Place Bet, empty state.
 *
 * Rendered identically inside the mobile bottom sheet and the desktop rail, so
 * the two can never disagree about what the slip contains; only the frame
 * around it differs. All the state comes from `useBetSlip()`, which Phase 4.2
 * already made headless for exactly this.
 *
 * The summary is pinned to the bottom rather than scrolling with the rows: the
 * two numbers a user checks before committing are what it costs and what it
 * returns, and neither should require a scroll to find.
 */
export function BetSlipPanel({
  onPlaced,
  className,
}: {
  /**
   * Lets the mobile sheet dismiss itself once the whole slip is away. It does
   * not fire on a partial success — the rows still on screen are the ones the
   * user needs to look at.
   */
  onPlaced?: () => void;
  className?: string;
}) {
  const { rows, totalStake, totalPotentialWin, canPlace, pending, clear, placeBets } = useBetSlip();

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center",
          className,
        )}
      >
        <span className="bg-primary/10 text-primary ring-primary/20 flex size-12 items-center justify-center rounded-full ring-1 ring-inset">
          <TicketIcon className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="font-heading font-semibold">Your slip is empty</p>
          <p className="text-muted-foreground text-sm text-balance">
            Tap any odds button on a match to add it here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1">
        <ul className="divide-border divide-y">
          {rows.map((row) => (
            <SlipRow key={row.key} row={row} />
          ))}
        </ul>

        <button
          type="button"
          onClick={clear}
          disabled={pending}
          className="text-muted-foreground hover:text-destructive my-2 inline-flex h-11 items-center gap-1.5 text-xs transition-colors disabled:opacity-50"
        >
          <Trash2Icon className="size-3.5" />
          Clear slip
        </button>
      </div>

      {/* The hairline above the summary is the brand green: it separates the
          totals from the rows and marks where the committing happens. */}
      <div className="border-primary/25 bg-card/60 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <dl className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              Total stake
              <span className="text-muted-foreground/80">
                {" "}
                · {rows.length} bet{rows.length === 1 ? "" : "s"}
              </span>
            </dt>
            <dd className="font-semibold tabular-nums">{formatCoins(totalStake)}</dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-muted-foreground">Potential win</dt>
            <dd className="text-win font-heading text-lg font-bold tabular-nums">
              {formatCoins(totalPotentialWin)}
            </dd>
          </div>
        </dl>

        <Button
          type="button"
          onClick={() => placeBets(onPlaced)}
          disabled={!canPlace}
          className="mt-3 h-12 w-full text-sm font-semibold not-disabled:glow-primary"
        >
          {pending ? (
            <>
              <Loader2Icon className="animate-spin" />
              Placing…
            </>
          ) : (
            <>Place {rows.length === 1 ? "bet" : `${rows.length} bets`}</>
          )}
        </Button>
      </div>
    </div>
  );
}

function SlipRow({ row }: { row: BetSlipRow }) {
  const { remove, setStake, pending } = useBetSlip();

  return (
    <li className="grid gap-2 py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {row.optionName}
            <span className="text-primary ml-1.5 font-semibold tabular-nums">
              {formatRatio(row.ratio)}
            </span>
          </p>
          <p className="text-muted-foreground truncate text-xs">{row.questionText}</p>
          <p className="text-muted-foreground/80 truncate text-xs">{row.matchTitle}</p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => remove(row.key)}
          disabled={pending}
          aria-label={`Remove ${row.optionName} from the slip`}
          // 28px of button, 44px of target: the thumb gets the touch minimum
          // without a chunky icon button crowding the row.
          className="relative after:absolute after:-inset-2 after:content-['']"
        >
          <XIcon />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          // The engine re-checks both bounds; these only spare a round trip.
          min={row.minStake}
          max={row.maxStake}
          step={1}
          value={row.stake === 0 ? "" : row.stake}
          onChange={(event) => setStake(row.key, Number(event.target.value))}
          disabled={pending}
          aria-invalid={row.issue ? true : undefined}
          aria-label={`Stake on ${row.optionName}`}
          className="h-11 w-28 text-sm font-semibold tabular-nums"
        />

        <p className="text-muted-foreground ml-auto text-right text-xs">
          To win
          <span className="text-win ml-1 font-semibold tabular-nums">
            {formatCoins(row.potentialWin)}
          </span>
        </p>
      </div>

      {row.issue ? <p className="text-destructive text-xs">{row.issue}</p> : null}
    </li>
  );
}
