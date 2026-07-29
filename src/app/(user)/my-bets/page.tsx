import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EMPTY_ART, EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PaginationNav } from "@/components/common/pagination-nav";
import { SegmentedNav } from "@/components/common/segmented-nav";
import { BetRow } from "@/components/bet/bet-row";
import { WinCelebration } from "@/components/bet/win-celebration";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { getRecentWins, getUserBets, parseBetTab, type BetTab } from "@/lib/bet-history";
import { parsePageParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "My Bets" };

/**
 * My Bets (Phase 5.6) — Open and Settled, both paginated on the server.
 *
 * Tab and page are query params so a row can be linked to and a refresh lands
 * where the user was, rather than resetting to the top of "Open".
 */
export default async function MyBetsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { tab: requestedTab, page: requestedPage } = await searchParams;
  const tab = parseBetTab(requestedTab);
  const page = parsePageParam(requestedPage);

  // Fetched on both tabs (7.5): the celebration has to fire wherever the user
  // lands, and the Open tab holds no settled bets by definition.
  const [bets, recentWins] = await Promise.all([
    getUserBets(session.user.id, { tab, page }),
    getRecentWins(session.user.id),
  ]);

  const href = (value: BetTab, pageNumber = 1) =>
    `/my-bets?tab=${value}${pageNumber > 1 ? `&page=${pageNumber}` : ""}`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <WinCelebration wins={recentWins} />

      <PageHeader
        title="My Bets"
        description="Every selection you've placed, and how it turned out."
      />

      <SegmentedNav
        ariaLabel="Bet status"
        active={tab}
        items={[
          { value: "open", label: "Open", href: href("open"), count: bets.counts.open },
          { value: "settled", label: "Settled", href: href("settled"), count: bets.counts.settled },
        ]}
      />

      {bets.rows.length === 0 ? (
        <EmptyState
          art={EMPTY_ART.bets}
          title={tab === "open" ? "No open bets" : "Nothing settled yet"}
          description={
            tab === "open"
              ? "Back a market and it'll show up here until it's settled."
              : "Once your open bets are resolved, the results land here."
          }
          action={
            tab === "open" ? (
              <Button asChild>
                <Link href="/">Browse games</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ul className="grid gap-2.5">
            {bets.rows.map((bet) => (
              <li key={bet.id}>
                <BetRow bet={bet} />
              </li>
            ))}
          </ul>

          <PaginationNav
            page={bets.page}
            totalPages={bets.totalPages}
            totalItems={bets.total}
            itemLabel="bets"
            buildHref={(pageNumber) => href(tab, pageNumber)}
          />
        </>
      )}
    </div>
  );
}
