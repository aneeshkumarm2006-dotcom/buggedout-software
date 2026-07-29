import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CoinsIcon, HistoryIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PaginationNav } from "@/components/common/pagination-nav";
import { LedgerList } from "@/components/wallet/ledger-list";
import { CoinCounter } from "@/components/user/coin-counter";
import { DailyBonusButton } from "@/components/user/daily-bonus-button";
import { auth } from "@/auth";
import { getAccountSummary } from "@/lib/account";
import { formatCoins } from "@/lib/format";
import { getUserLedger } from "@/lib/ledger";
import { parsePageParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Wallet" };

/**
 * The wallet (Phase 5.7): balance, the daily-bonus claim, and the paginated
 * history behind both.
 *
 * The history comes from the Transaction ledger, which the model makes
 * append-only — so this is every coin that has ever moved on the account, in
 * the order it moved, and nothing can have been quietly edited out of it.
 */
export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { page: requestedPage } = await searchParams;
  const page = parsePageParam(requestedPage);

  const [account, ledger] = await Promise.all([
    getAccountSummary(session.user.id),
    getUserLedger(session.user.id, { page }),
  ]);

  if (!account) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader title="Wallet" description="Your coins and everything that moved them." />

      <section className="bg-card ring-foreground/10 flex flex-wrap items-center justify-between gap-4 rounded-xl px-5 py-4 ring-1">
        <div>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">Balance</p>
          <p className="font-heading flex items-center gap-2 text-3xl font-bold tabular-nums">
            <CoinsIcon className="text-primary size-6" />
            <CoinCounter value={account.coinBalance} />
          </p>
          <p className="text-muted-foreground text-xs">Free virtual coins — no cash value.</p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <DailyBonusButton
            key={account.nextDailyBonusAt ?? "claimable"}
            amount={account.dailyBonusAmount}
            nextClaimAt={account.nextDailyBonusAt}
          />
          {account.dailyBonusAmount > 0 ? (
            <p className="text-muted-foreground text-xs">
              {formatCoins(account.dailyBonusAmount)} free coins every 24 hours
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">History</h2>

        {ledger.rows.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title="No transactions yet"
            description="Bonuses, bets and winnings all land here as soon as they happen."
          />
        ) : (
          <>
            <LedgerList rows={ledger.rows} />

            <PaginationNav
              page={ledger.page}
              totalPages={ledger.totalPages}
              totalItems={ledger.total}
              itemLabel="transactions"
              buildHref={(pageNumber) =>
                pageNumber > 1 ? `/wallet?page=${pageNumber}` : "/wallet"
              }
            />
          </>
        )}
      </section>
    </div>
  );
}
