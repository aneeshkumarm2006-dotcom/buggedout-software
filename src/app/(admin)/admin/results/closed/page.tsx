import type { Metadata } from "next";
import Link from "next/link";

import { ListToolbar } from "@/components/admin/list-toolbar";
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
import { QuestionStatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { listCategoryOptions } from "@/lib/admin/categories";
import { requireAdminPage } from "@/lib/admin/guard";
import {
  buildAdminHref,
  parseFilter,
  parseIdFilter,
  parsePage,
  parseSearch,
  type SearchParamsRecord,
} from "@/lib/admin/list-params";
import { listClosedResults } from "@/lib/admin/results";
import { formatCoins } from "@/lib/format";

export const metadata: Metadata = { title: "Closed results" };

const PATH = "/admin/results/closed";

const SETTLED_STATUSES = ["resolved", "void"] as const;

/**
 * Closed results (Phase 6.10): what was decided, what it paid out, who decided
 * it and when. Read straight off the questions and their settled bets — there
 * is no separate results table to drift out of step with the money.
 */
export default async function ClosedResultsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireAdminPage("results.view");
  const params = await searchParams;

  const page = parsePage(params.page);
  const q = parseSearch(params.q);
  const categoryId = parseIdFilter(params.categoryId);
  const status = parseFilter<(typeof SETTLED_STATUSES)[number]>(params.status, SETTLED_STATUSES);

  const [closed, categories] = await Promise.all([
    listClosedResults({ page, q, categoryId, status }),
    listCategoryOptions(),
  ]);

  const query = { q, categoryId, status };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Closed results"
        description="Every market that has been settled or voided, newest first."
      />

      <ListToolbar
        pathname={PATH}
        params={query}
        searchPlaceholder="Question text…"
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
            label: "Outcome",
            value: status,
            options: [
              { value: "resolved", label: "Resolved" },
              { value: "void", label: "Voided" },
            ],
          },
        ]}
      />

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Market</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Winner</TableHead>
              <TableHead className="text-right">Bets</TableHead>
              <TableHead className="text-right">Staked</TableHead>
              <TableHead className="text-right">Paid out</TableHead>
              <TableHead>Settled by</TableHead>
              <TableHead className="pr-4 text-right">When</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {closed.rows.length === 0 ? (
              <TableEmptyRow colSpan={8}>
                {q || categoryId || status
                  ? "No results match those filters."
                  : "Nothing has been settled yet."}
              </TableEmptyRow>
            ) : (
              closed.rows.map((result) => (
                <TableRow key={result.id}>
                  <TableCell className="pl-4">
                    <p className="max-w-64 truncate font-medium">{result.text}</p>
                    <p className="text-muted-foreground max-w-64 truncate text-xs">
                      <Link
                        href={`/admin/matches/${result.matchId}/questions`}
                        className="hover:text-primary"
                      >
                        {result.matchTitle}
                      </Link>
                      {" · "}
                      {result.categoryTitle}
                    </p>
                  </TableCell>

                  <TableCell>
                    <QuestionStatusBadge status={result.status} />
                  </TableCell>

                  <TableCell>
                    {result.winners.length === 0 ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {result.winners.map((winner) => (
                          <Badge key={winner} variant="outline" className="border-primary text-primary">
                            {winner}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {formatCoins(result.betsSettled)}
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {formatCoins(result.totalStake)}
                  </TableCell>

                  <TableCell className="text-primary text-right font-medium tabular-nums">
                    {formatCoins(result.totalPayout)}
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {result.resolvedBy ?? "—"}
                  </TableCell>

                  <TableCell className="text-muted-foreground pr-4 text-right text-xs">
                    {result.resolvedAt ? (
                      <LocalTime value={result.resolvedAt} format="short" />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>

      <PaginationNav
        page={closed.page}
        totalPages={closed.totalPages}
        totalItems={closed.total}
        itemLabel="results"
        buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
      />
    </div>
  );
}
