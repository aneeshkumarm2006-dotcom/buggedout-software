import Link from "next/link";

import { LocalTime } from "@/components/common/local-time";
import { BetStatusBadge } from "@/components/common/status-badge";
import { formatCoins, formatRatio } from "@/lib/format";
import type { BetHistoryRow } from "@/lib/bet-history";
import { cn } from "@/lib/utils";

/**
 * One row of My Bets (Phase 5.6, styled in 7.3/7.5).
 *
 * A settled bet shows what it *returned*; an open one shows what it *would*
 * return. Those are different promises and giving them the same label is how a
 * user ends up thinking they've already been paid.
 *
 * A win gets the green rim and nothing else does — scanning a long list for the
 * ones that paid shouldn't require reading a single word.
 */
export function BetRow({ bet }: { bet: BetHistoryRow }) {
  const open = bet.status === "pending";
  const won = bet.status === "won";

  return (
    <article
      className={cn(
        "bg-card space-y-2.5 rounded-xl px-4 py-3 ring-1",
        won ? "ring-win/35 shadow-[0_0_28px_-14px_var(--win)]" : "ring-foreground/10",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium">
            {bet.optionName}
            <span className="text-primary ml-1.5 font-semibold tabular-nums">
              {formatRatio(bet.ratio)}
            </span>
          </p>
          <p className="text-muted-foreground truncate text-xs">{bet.questionText}</p>
        </div>

        <BetStatusBadge status={bet.status} className="shrink-0" />
      </div>

      <Link
        href={`/matches/${bet.matchId}`}
        // The one link on the row, so it gets the thumb minimum (7.4) rather
        // than the 16px a line of `text-xs` would otherwise be.
        className="text-muted-foreground hover:text-foreground touch-target flex items-center truncate text-xs underline-offset-3 hover:underline"
      >
        {bet.categoryTitle ? `${bet.categoryTitle} · ` : ""}
        {bet.matchTitle}
      </Link>

      <dl className="flex flex-wrap items-end gap-x-5 gap-y-1 text-xs">
        <div>
          <dt className="text-muted-foreground">Stake</dt>
          <dd className="font-semibold tabular-nums">{formatCoins(bet.stake)}</dd>
        </div>

        <div>
          <dt className="text-muted-foreground">{open ? "To win" : "Returned"}</dt>
          <dd
            className={cn(
              "font-semibold tabular-nums",
              won && "text-win font-heading text-sm",
              !open && !won && "text-muted-foreground",
            )}
          >
            {formatCoins(open ? bet.potentialWin : bet.payout)}
          </dd>
        </div>

        <div className="ml-auto text-right">
          <dt className="text-muted-foreground">{open ? "Placed" : "Settled"}</dt>
          <dd className="text-muted-foreground">
            <LocalTime value={bet.settledAt ?? bet.placedAt} format="short" />
          </dd>
        </div>
      </dl>
    </article>
  );
}
