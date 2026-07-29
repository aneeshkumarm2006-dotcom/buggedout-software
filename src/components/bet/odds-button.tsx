"use client";

import { CheckIcon, LockIcon } from "lucide-react";

import { useBetSlip, type BetSlipOption } from "@/components/bet/bet-slip-provider";
import { formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A tappable price — `Turtle A | 2.0` (Phase 5.4).
 *
 * Tapping toggles the selection on the slip; a user may hold several options of
 * the same question at once, since each one is an independent bet. The button
 * carries the whole selection payload rather than an id, so the slip can render
 * a row (and its potential win) without a second round trip — the server still
 * re-reads the real price at placement, so nothing here can buy better odds.
 *
 * Phase 7.3 gives the states their look. Four of them, and none is distinguished
 * by colour alone: selected is filled *and* ticked, suspended is hatched *and*
 * struck through *and* padlocked, a closed market is flat, and a settled winner
 * keeps its tick. That matters on a screen someone is squinting at outdoors as
 * much as it does for a colour-blind user.
 */
export function OddsButton({
  option,
  disabled,
  suspended,
  isWinner,
  settled,
}: {
  option: BetSlipOption;
  /** The market is closed — priced, but not open for new bets. */
  disabled?: boolean;
  /** This one option is suspended while the rest of the market trades on. */
  suspended?: boolean;
  isWinner?: boolean;
  /** The market has been resolved, so winners and losers are both final. */
  settled?: boolean;
}) {
  const { isSelected, toggle } = useBetSlip();
  const selected = isSelected(option.questionId, option.optionId);
  const locked = disabled || suspended;
  const won = Boolean(settled && isWinner);
  const lost = Boolean(settled && !isWinner);

  return (
    <button
      type="button"
      onClick={() => toggle(option)}
      disabled={locked}
      aria-pressed={selected}
      title={
        suspended
          ? `${option.optionName} — suspended`
          : `${option.optionName} at ${formatRatio(option.ratio)}`
      }
      className={cn(
        // 44px tall: this is the control the whole product is tapped through.
        "relative flex h-11 min-w-0 items-center justify-between gap-2 rounded-lg border px-3 text-sm font-medium",
        "transition-[color,background-color,border-color,box-shadow,transform] duration-150",
        "focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none",

        // Open and untouched.
        !locked &&
          !selected &&
          "border-border bg-card hover:border-primary/45 hover:bg-accent/70 active:translate-y-px",

        // On the slip. The only filled control on the page, deliberately.
        selected && "border-primary bg-primary text-primary-foreground glow-primary font-semibold",

        // This price only: still on screen, not tradeable.
        suspended && "hatched border-border/50 bg-muted/25 text-muted-foreground/80 cursor-not-allowed",

        // The whole market is shut.
        disabled && !suspended && "border-border/50 bg-muted/20 text-muted-foreground cursor-not-allowed",

        // Resolved: the winner stays legible, the rest recede.
        won && "border-win/60 bg-win/12 text-win cursor-default",
        lost && "opacity-55",
      )}
    >
      <span className="truncate">{option.optionName}</span>

      <span className="flex shrink-0 items-center gap-1 tabular-nums">
        {won ? <CheckIcon className="size-3.5" aria-hidden /> : null}
        {suspended ? (
          <>
            <LockIcon className="size-3" aria-hidden />
            <s className="decoration-from-font">{formatRatio(option.ratio)}</s>
            <span className="sr-only">suspended</span>
          </>
        ) : (
          <span className={cn(!locked && !selected && "text-primary")}>
            {formatRatio(option.ratio)}
          </span>
        )}
      </span>
    </button>
  );
}
