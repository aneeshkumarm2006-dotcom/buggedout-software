import Link from "next/link";
import { CoinsIcon } from "lucide-react";

import { CoinCounter } from "@/components/user/coin-counter";
import { cn } from "@/lib/utils";

/**
 * The coin balance in the header. A link to the wallet rather than a plain
 * label — tapping your balance to see where it went is what everyone tries
 * first. The number itself rolls (7.5) via `<CoinCounter>`.
 */
export function BalancePill({
  coinBalance,
  className,
}: {
  coinBalance: number;
  className?: string;
}) {
  return (
    <Link
      href="/wallet"
      title="Your coin balance"
      className={cn(
        // 44px on touch (7.4); the header is 56px tall there.
        "bg-muted/60 hover:bg-muted ring-border hover:ring-primary/30 flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ring-1 ring-inset transition-colors lg:h-9",
        className,
      )}
    >
      <CoinsIcon className="text-primary size-4 shrink-0" />
      <CoinCounter value={coinBalance} />
      <span className="sr-only"> coins — open wallet</span>
    </Link>
  );
}
