import type { Metadata } from "next";
import Link from "next/link";

import { ListToolbar } from "@/components/admin/list-toolbar";
import { StatCard } from "@/components/admin/stat-card";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/admin/table-card";
import { LocalTime } from "@/components/common/local-time";
import { PageHeader } from "@/components/common/page-header";
import { PaginationNav } from "@/components/common/pagination-nav";
import { BetStatusBadge } from "@/components/common/status-badge";
import { listCategoryOptions } from "@/lib/admin/categories";
import { requireAdminPage } from "@/lib/admin/guard";
import { listBets } from "@/lib/admin/ledger";
import {
  buildAdminHref,
  parseFilter,
  parseIdFilter,
  parsePage,
  parseSearch,
  type SearchParamsRecord,
} from "@/lib/admin/list-params";
import { BET_STATUSES, type BetStatus } from "@/lib/enums";
import { formatCoins, formatRatio, formatSignedCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "All bets" };

const PATH = "/admin/bets";

const STATUS_LABEL: Record<BetStatus, string> = {
  pending: "Open",
  won: "Won",
  lost: "Lost",
  void: "Cancelled",
  refunded: "Refunded",
};

/**
 * Every bet ever placed (Phase 6.12).
 *
 * The odds and the option name on each row are the snapshots taken at
 * placement, not the market's current values — which is exactly what makes this
 * a usable record when a user asks why they were paid what they were paid.
 */
export default async function AdminBetsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireAdminPage("bets.view");
  const params = await searchParams;

  const page = parsePage(params.page);
  const q = parseSearch(params.q);
  const status = parseFilter<BetStatus>(params.status, BET_STATUSES);
  const categoryId = parseIdFilter(params.categoryId);
  const matchId = parseIdFilter(params.matchId);

  const [bets, categories] = await Promise.all([
    listBets({ page, q, status, categoryId, matchId }),
    listCategoryOptions(),
  ]);

  const query = { q, status, categoryId, matchId };

  return (
    <div className="space-y-5">
      <PageHeader
        title="All bets"
        description="Every bet ever placed. The payout shown on a row is the one that bet was given at the time — which is what it gets paid at, whatever the odds say now."
      />

      <ListToolbar
        pathname={PATH}
        params={query}
        searchPlaceholder="Username or email…"
        filters={[
          {
            name: "categoryId",
            label: "Game",
            value: categoryId,
            allLabel: "All games",
            options: categories.map((category) => ({ value: category.id, label: category.title })),
          },
          {
            name: "status",
            label: "Status",
            value: status,
            options: BET_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] })),
          },
        ]}
      />

      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Bets" value={formatCoins(bets.total)} hint="In this view" />
        <StatCard label="Staked" value={formatCoins(bets.totals.staked)} hint="In this view" />
        <StatCard
          label="Returned"
          value={formatCoins(bets.totals.returned)}
          hint={`House ${formatSignedCoins(bets.totals.staked - bets.totals.returned)}`}
        />
      </section>

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">User</TableHead>
              <TableHead>Question</TableHead>
              <TableHead>Selection</TableHead>
              <TableHead className="text-right">Stake</TableHead>
              <TableHead className="text-right">To win</TableHead>
              <TableHead className="text-right">Returned</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Placed</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {bets.rows.length === 0 ? (
              <TableEmptyRow colSpan={8}>
                {q || status || categoryId || matchId
                  ? "No bets match those filters."
                  : "Nobody has placed a bet yet."}
              </TableEmptyRow>
            ) : (
              bets.rows.map((bet) => (
                <TableRow key={bet.id}>
                  <TableCell className="pl-4 font-medium">
                    <Link href={`/admin/users/${bet.userId}`} className="hover:text-primary">
                      {bet.username}
                    </Link>
                  </TableCell>

                  <TableCell className="max-w-56 truncate">
                    <Link
                      href={`/admin/matches/${bet.matchId}/questions`}
                      className="hover:text-primary"
                    >
                      {bet.matchTitle}
                    </Link>
                    <p className="text-muted-foreground truncate text-xs">
                      {bet.categoryTitle} · {bet.questionText}
                    </p>
                  </TableCell>

                  <TableCell>
                    {bet.optionName}
                    <span className="text-muted-foreground ml-1.5 tabular-nums">
                      {formatRatio(bet.ratio)}
                    </span>
                  </TableCell>

                  <TableCell className="text-right tabular-nums">{formatCoins(bet.stake)}</TableCell>

                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {formatCoins(bet.potentialWin)}
                  </TableCell>

                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      bet.payout > 0 && "text-primary font-medium",
                    )}
                  >
                    {bet.payout > 0 ? formatCoins(bet.payout) : "—"}
                  </TableCell>

                  <TableCell>
                    <BetStatusBadge status={bet.status} />
                  </TableCell>

                  <TableCell className="text-muted-foreground pr-4 text-right text-xs">
                    <LocalTime value={bet.placedAt} format="short" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>

      <PaginationNav
        page={bets.page}
        totalPages={bets.totalPages}
        totalItems={bets.total}
        itemLabel="bets"
        buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
      />
    </div>
  );
}
