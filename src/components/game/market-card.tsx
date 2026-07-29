import { LockIcon, TimerIcon } from "lucide-react";

import { Countdown } from "@/components/common/countdown";
import { LocalTime } from "@/components/common/local-time";
import { QuestionStatusBadge } from "@/components/common/status-badge";
import { OddsButton } from "@/components/bet/odds-button";
import { formatCoins } from "@/lib/format";
import type { Market } from "@/lib/matches";
import { cn } from "@/lib/utils";

/**
 * One question and its prices (Phase 5.4).
 *
 * Whether the odds are tappable is decided here, from the server's own copy of
 * the market: an inactive option is suspended, a non-`active` question or a
 * match that has stopped taking bets closes the whole card. The engine re-checks
 * all of it at placement — this is what stops a user *starting* a bet they can't
 * finish, not what enforces the rule.
 */
export function MarketCard({
  market,
  matchId,
  matchTitle,
  matchBettable,
}: {
  market: Market;
  matchId: string;
  matchTitle: string;
  matchBettable: boolean;
}) {
  const open = market.status === "active" && matchBettable;
  const settled = market.status === "resolved";

  return (
    <section className="bg-card ring-foreground/10 space-y-3 rounded-xl px-4 py-3.5 ring-1">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <QuestionStatusBadge status={market.status} />

          {open ? (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <TimerIcon className="size-3.5" />
              <Countdown target={market.endDate} prefix="closes in" endedLabel="Closing" />
            </span>
          ) : market.status === "locked" ? (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <LockIcon className="size-3.5" />
              Closed <LocalTime value={market.endDate} format="short" />
            </span>
          ) : null}
        </div>

        <h3 className="font-medium text-balance">{market.text}</h3>
      </div>

      <div className={cn("grid gap-2", optionGridClass(market.options.length))}>
        {market.options.map((option) => (
          <OddsButton
            key={option.id}
            option={{
              matchId,
              matchTitle,
              questionId: market.id,
              questionText: market.text,
              optionId: option.id,
              optionName: option.name,
              ratio: option.ratio,
              minStake: market.minStake,
              maxStake: market.maxStake,
            }}
            disabled={!open}
            suspended={open && option.status !== "active"}
            isWinner={option.isWinner}
            settled={settled}
          />
        ))}
      </div>

      {open ? (
        <p className="text-muted-foreground/80 text-xs">
          Stake {formatCoins(market.minStake)}–{formatCoins(market.maxStake)} coins per bet
        </p>
      ) : null}
    </section>
  );
}

/**
 * Two and three options get a row each; past that the grid wraps, because eight
 * lanes will not fit across a 375px screen without one.
 */
function optionGridClass(count: number): string {
  if (count <= 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-3";
  return "grid-cols-2 sm:grid-cols-4";
}
