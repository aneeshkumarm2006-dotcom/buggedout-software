import type { Metadata } from "next";
import Link from "next/link";
import { BanIcon, CheckCheckIcon } from "lucide-react";

import { voidQuestionAction } from "@/app/(admin)/actions";
import { ConfirmActionButton } from "@/components/admin/action-button";
import { HelpNote } from "@/components/admin/help-note";
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
import { ACTIONS, payoutExample } from "@/lib/admin/wording";
import { formatCoins, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Results to enter" };

const PATH = "/admin/results/pending";

/**
 * Results to enter (Phase 6.9) — every question that has stopped taking bets and
 * is still waiting on an outcome, oldest first, because that is the one keeping
 * someone from their coins.
 *
 * Reading this page also sweeps expired questions into `locked` (4.3), so the
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
        title="Results to enter"
        description="Betting has closed on these and nobody has been paid yet. Oldest first — that's the player who has been waiting longest."
      />

      {pending.rows.length > 0 ? (
        <HelpNote
          steps={[
            <>
              Press <strong>Enter result</strong> and tick what actually happened.
            </>,
            <>
              The next screen shows you <strong>exactly what it will cost</strong> before you
              confirm.
            </>,
            <>
              Confirm, and every player who got it right is paid instantly at the payout they were
              given when they bet.
            </>,
          ]}
        >
          <p>
            If the event didn&apos;t happen, use <strong>Cancel &amp; refund</strong> instead —
            nobody wins or loses and every player gets their coins back.
          </p>
        </HelpNote>
      ) : null}

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
          title={q || categoryId ? "Nothing matches those filters" : "Nothing waiting on you"}
          description={
            q || categoryId
              ? "Try clearing the search or the game filter."
              : "Every question that has closed has had its result entered. New ones land here on their own, the moment betting closes."
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
                    {formatCoins(question.uniqueBettors)} player
                    {question.uniqueBettors === 1 ? "" : "s"} waiting ·{" "}
                    {formatCoins(question.pendingBets)} bet
                    {question.pendingBets === 1 ? "" : "s"} ·{" "}
                    {formatCoins(question.totalStake)} coins staked
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
                      triggerLabel={ACTIONS.resolve.short}
                      triggerSize="lg"
                    />
                  ) : null}

                  {canVoid ? (
                    <ConfirmActionButton
                      action={voidQuestionAction.bind(null, question.id)}
                      title="Cancel this question and refund everyone?"
                      description={`Nobody wins or loses. All ${question.pendingBets} open bet${question.pendingBets === 1 ? "" : "s"} — ${formatCoins(question.totalStake)} coins — go straight back to the players who placed them. This can't be undone.`}
                      confirmLabel="Cancel & refund"
                      reason={{
                        label: "Why? (players don't see this)",
                        placeholder: "Race abandoned…",
                      }}
                      variant="outline"
                      size="lg"
                    >
                      <BanIcon />
                      Cancel &amp; refund
                    </ConfirmActionButton>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {question.options.map((option) => (
                  <Badge
                    key={option.id}
                    variant="outline"
                    title={payoutExample(option.ratio)}
                    className={cn(
                      "h-7 gap-1.5 px-2.5",
                      option.status === "inactive" && "text-muted-foreground line-through",
                    )}
                  >
                    {option.name}
                    <span className="tabular-nums opacity-70">×{formatRatio(option.ratio)}</span>
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
        itemLabel="waiting"
        buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
      />
    </div>
  );
}
