import type { LucideIcon } from "lucide-react";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  BanknoteIcon,
  GiftIcon,
  SparklesIcon,
  TicketIcon,
  TrophyIcon,
  UndoIcon,
  UsersIcon,
} from "lucide-react";

import { LocalTime } from "@/components/common/local-time";
import type { TransactionType } from "@/lib/enums";
import { formatCoins, formatSignedCoins } from "@/lib/format";
import type { LedgerRow } from "@/lib/ledger";
import { cn } from "@/lib/utils";

/**
 * The wallet's transaction history (Phase 5.7).
 *
 * Every row carries the `balanceAfter` the movement landed on, straight off the
 * immutable ledger — the running total is a fact recorded at the time, not a
 * number this page adds up.
 */
const LEDGER_META: Record<TransactionType, { label: string; icon: LucideIcon }> = {
  signup_bonus: { label: "Welcome bonus", icon: SparklesIcon },
  daily_bonus: { label: "Daily bonus", icon: GiftIcon },
  bet_place: { label: "Bet placed", icon: TicketIcon },
  bet_win: { label: "Bet won", icon: TrophyIcon },
  bet_refund: { label: "Bet refunded", icon: UndoIcon },
  admin_credit: { label: "Credit from support", icon: ArrowUpRightIcon },
  admin_debit: { label: "Adjustment", icon: ArrowDownRightIcon },
  referral_commission: { label: "Referral reward", icon: UsersIcon },
};

export function LedgerList({ rows }: { rows: LedgerRow[] }) {
  return (
    <ul className="divide-border bg-card ring-foreground/10 divide-y overflow-hidden rounded-xl ring-1">
      {rows.map((row) => {
        const meta = LEDGER_META[row.type] ?? { label: row.type, icon: BanknoteIcon };
        const Icon = meta.icon;
        const credit = row.amount > 0;

        return (
          <li key={row.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full",
                credit ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{meta.label}</p>
              <p className="text-muted-foreground truncate text-xs">
                {row.note ? `${row.note} · ` : ""}
                <LocalTime value={row.createdAt} format="short" />
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  credit ? "text-primary" : "text-foreground",
                )}
              >
                {formatSignedCoins(row.amount)}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {formatCoins(row.balanceAfter)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
