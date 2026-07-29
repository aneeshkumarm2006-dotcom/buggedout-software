import { BalancePill } from "@/components/user/balance-pill";
import { BrandMark } from "@/components/user/brand-mark";
import { DailyBonusButton } from "@/components/user/daily-bonus-button";
import type { AccountSummary } from "@/lib/account";

/**
 * The sticky header (Phase 5.1): balance and the daily-bonus claim, everywhere,
 * on every page.
 *
 * The wordmark only appears below `lg` — above it the sidebar already carries
 * one, and two would just be noise.
 */
export function TopBar({ account }: { account: AccountSummary }) {
  return (
    <header className="bg-background/90 sticky top-0 z-30 border-b backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4 lg:h-16 lg:px-6">
        <BrandMark className="lg:hidden" />

        <div className="ml-auto flex items-center gap-2">
          <BalancePill coinBalance={account.coinBalance} />

          <DailyBonusButton
            // Keyed on the window so a refreshed claim time remounts the
            // countdown rather than being synced in through an effect.
            key={account.nextDailyBonusAt ?? "claimable"}
            amount={account.dailyBonusAmount}
            nextClaimAt={account.nextDailyBonusAt}
          />
        </div>
      </div>
    </header>
  );
}
