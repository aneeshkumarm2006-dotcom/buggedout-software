import type { Metadata } from "next";
import Link from "next/link";
import { BanIcon, CheckCheckIcon } from "lucide-react";

import { voidQuestionAction } from "@/app/(admin)/actions";
import { ConfirmActionButton } from "@/components/admin/action-button";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { ResolveDialog } from "@/components/admin/resolve-dialog";
import { TableCard } from "@/components/admin/table-card";
import { EmptyState } from "@/components/common/empty-state";
import { LocalTime } from "@/components/common/local-time";
import { PageHeader } from "@/components/common/page-header";
import { PaginationNav } from "@/components/common/pagination-nav";
import { Badge } from "@/components/ui/badge";
import { listCategoryOptions } from "@/lib/admin/categories";
import { actorCan, requireAdminPage } from "@/lib/admin/guard";
import {
  buildAdminHref,
  parseIdFilter,
  parsePage,
  parseSearch,
  type SearchParamsRecord,
} from "@/lib/admin/list-params";
import { listPendingResults } from "@/lib/admin/results";
import { formatCoins, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pending results" };

const PATH = "/admin/results/pending";

/**
 * Pending results (Phase 6.9) — every market that has stopped taking bets and
 * is still waiting on an outcome, oldest first, because that is the one keeping
 * someone from their coins.
 *
 * Reading this page also sweeps expired markets into `locked` (4.3), so the
 * queue is never short just because the cron job is late.
 */
export default async function PendingResultsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const actor = await requireAdminPage(["results.view", "results.resolve"]);
  const params = await searchParams;

  const page = parsePage(params.page);
  const q = parseSearch(params.q);
  const categoryId = parseIdFilter(params.categoryId);

  const [pending, categories] = await Promise.all([
    listPendingResults({ page, q, categoryId }),
    listCategoryOptions(),
  ]);

  const canResolve = actorCan(actor, "results.resolve");
  const canVoid = actorCan(actor, "results.void");
  const query = { q, categoryId };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pending results"
        description="Markets closed to betting and still waiting on an outcome. Settling pays every winning bet its snapshot odds."
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
        ]}
      />

      {pending.rows.length === 0 ? (
        <EmptyState
          icon={CheckCheckIcon}
          title={q || categoryId ? "Nothing matches those filters" : "Nothing waiting"}
          description={
            q || categoryId
              ? "Try clearing the search or the game filter."
              : "Every closed market has a result. Markets appear here as soon as their betting window ends."
          }
        />
      ) : (
        <div className="grid gap-3">
          {pending.rows.map((question) => (
            <TableCard key={question.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-muted-foreground text-xs">
                    <Link
                      href={`/admin/matches/${question.matchId}/questions`}
                      className="hover:text-primary"
                    >
                      {question.matchTitle}
                    </Link>
                    <span className="mx-1.5">·</span>
                    {question.categoryTitle}
                    <span className="mx-1.5">·</span>
                    closed <LocalTime value={question.endDate} format="short" />
                  </p>

                  <p className="font-medium">{question.text}</p>

                  <p className="text-muted-foreground text-xs tabular-nums">
                    {formatCoins(question.pendingBets)} open bet
                    {question.pendingBets === 1 ? "" : "s"} ·{" "}
                    {formatCoins(question.totalStake)} staked by{" "}
                    {formatCoins(question.uniqueBettors)} user
                    {question.uniqueBettors === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {canResolve ? (
                    <ResolveDialog
                      questionId={question.id}
                      questionText={question.text}
                      options={question.options.map((option) => ({
                        id: option.id,
                        name: option.name,
                        ratio: option.ratio,
                      }))}
                      triggerLabel="Pick winner"
                      triggerSize="lg"
                    />
                  ) : null}

                  {canVoid ? (
                    <ConfirmActionButton
                      action={voidQuestionAction.bind(null, question.id)}
                      title="Void this market?"
                      description={`All ${question.pendingBets} open bet${question.pendingBets === 1 ? "" : "s"} are refunded in full and the market closes with no result.`}
                      confirmLabel="Void and refund"
                      reason={{ label: "Reason", placeholder: "Race abandoned…" }}
                      variant="outline"
                      size="lg"
                    >
                      <BanIcon />
                      Void
                    </ConfirmActionButton>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {question.options.map((option) => (
                  <Badge
                    key={option.id}
                    variant="outline"
                    className={cn(
                      "h-7 gap-1.5 px-2.5",
                      option.status === "inactive" && "text-muted-foreground line-through",
                    )}
                  >
                    {option.name}
                    <span className="tabular-nums opacity-70">{formatRatio(option.ratio)}</span>
                  </Badge>
                ))}
              </div>
            </TableCard>
          ))}
        </div>
      )}

      <PaginationNav
        page={pending.page}
        totalPages={pending.totalPages}
        totalItems={pending.total}
        itemLabel="markets"
        buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
      />
    </div>
  );
}
