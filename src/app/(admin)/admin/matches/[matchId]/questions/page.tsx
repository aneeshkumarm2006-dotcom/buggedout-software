import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BanIcon, LockIcon, PencilIcon, PlusIcon, Trash2Icon, UnlockIcon } from "lucide-react";

import { setQuestionLockAction, voidQuestionAction } from "@/app/(admin)/actions";
import { deleteQuestionAction } from "@/app/(admin)/catalog-actions";
import { ActionButton, ConfirmActionButton } from "@/components/admin/action-button";
import { FlashToast } from "@/components/admin/flash-toast";
import { ResolveDialog } from "@/components/admin/resolve-dialog";
import { TableCard } from "@/components/admin/table-card";
import { EmptyState } from "@/components/common/empty-state";
import { LocalTime } from "@/components/common/local-time";
import { PageHeader } from "@/components/common/page-header";
import { MatchStatusBadge, QuestionStatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actorCan, requireAdminPage } from "@/lib/admin/guard";
import { parseFlash, type SearchParamsRecord } from "@/lib/admin/list-params";
import { getMatchHeader } from "@/lib/admin/matches";
import { listMatchQuestions } from "@/lib/admin/questions";
import { formatCoins, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Markets" };

/**
 * A match's markets (Phase 6.8) — the "Action → Question List" the match table
 * links into.
 *
 * Cards rather than a table: a market is a question plus a variable number of
 * priced options, which does not want to be squeezed into fixed columns on a
 * phone.
 */
export default async function MatchQuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const actor = await requireAdminPage(["questions.view", "questions.manage"], {
    fallback: "/admin/matches",
  });

  const { matchId } = await params;
  const match = await getMatchHeader(matchId);

  if (!match) notFound();

  const [questions, { flash }] = await Promise.all([
    listMatchQuestions(matchId),
    searchParams,
  ]);

  const canManage = actorCan(actor, "questions.manage");
  const canResolve = actorCan(actor, "results.resolve");
  const canVoid = actorCan(actor, "results.void");

  return (
    <div className="space-y-5">
      <FlashToast message={parseFlash(flash)} />

      <PageHeader
        title={match.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <MatchStatusBadge status={match.status} />
            <span>{match.categoryTitle}</span>
            <span>·</span>
            <LocalTime value={match.startTime} format="short" />
          </span>
        }
        backHref="/admin/matches"
        backLabel="Matches"
        action={
          canManage ? (
            <Button asChild size="lg">
              <Link href={`/admin/matches/${match.id}/questions/new`}>
                <PlusIcon />
                New market
              </Link>
            </Button>
          ) : null
        }
      />

      {questions.length === 0 ? (
        <EmptyState
          title="No markets yet"
          description="A match with no questions can't be bet on. Add one — the game's templates are one tap away."
          action={
            canManage ? (
              <Button asChild size="lg">
                <Link href={`/admin/matches/${match.id}/questions/new`}>
                  <PlusIcon />
                  New market
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-3">
          {questions.map((question) => {
            const settled = question.status === "resolved" || question.status === "void";

            return (
              <TableCard key={question.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <QuestionStatusBadge status={question.status} />
                      <span className="text-muted-foreground text-xs">
                        {question.status === "resolved" || question.status === "void" ? (
                          <>
                            Settled <LocalTime value={question.resolvedAt ?? question.endDate} format="short" />
                          </>
                        ) : (
                          <>
                            Closes <LocalTime value={question.endDate} format="short" />
                          </>
                        )}
                      </span>
                    </div>

                    <p className="font-medium">{question.text}</p>

                    <p className="text-muted-foreground text-xs">
                      {formatCoins(question.totalStake)} staked
                      {question.pendingBets > 0
                        ? ` · ${formatCoins(question.pendingBets)} bet${question.pendingBets === 1 ? "" : "s"} open`
                        : ""}
                      {" · "}
                      {formatCoins(question.minStakePerBet)}–{formatCoins(question.maxStakePerBet)} per bet
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {canResolve && !settled ? (
                      <ResolveDialog
                        questionId={question.id}
                        questionText={question.text}
                        options={question.options.map((option) => ({
                          id: option.id,
                          name: option.name,
                          ratio: option.ratio,
                        }))}
                      />
                    ) : null}

                    {canManage && !settled ? (
                      <ActionButton
                        action={setQuestionLockAction.bind(
                          null,
                          question.id,
                          question.status !== "locked",
                        )}
                        variant="outline"
                        size="sm"
                      >
                        {question.status === "locked" ? <UnlockIcon /> : <LockIcon />}
                        {question.status === "locked" ? "Reopen" : "Suspend"}
                      </ActionButton>
                    ) : null}

                    {canManage && !settled ? (
                      <Button asChild variant="ghost" size="icon-sm" title="Edit market">
                        <Link href={`/admin/matches/${match.id}/questions/${question.id}`}>
                          <PencilIcon />
                          <span className="sr-only">Edit market</span>
                        </Link>
                      </Button>
                    ) : null}

                    {canVoid && !settled ? (
                      <ConfirmActionButton
                        action={voidQuestionAction.bind(null, question.id)}
                        title="Void this market?"
                        description="Every stake on it is refunded and the market is closed for good. Use this when the event didn't produce a result."
                        confirmLabel="Void and refund"
                        reason={{ label: "Reason", placeholder: "Race abandoned…" }}
                        variant="ghost"
                        size="icon-sm"
                      >
                        <BanIcon />
                        <span className="sr-only">Void market</span>
                      </ConfirmActionButton>
                    ) : null}

                    {canManage && !settled ? (
                      <ConfirmActionButton
                        action={deleteQuestionAction.bind(null, question.id)}
                        title="Delete this market?"
                        description="Only possible while nothing has been staked on it. Otherwise void it — that refunds and keeps the history."
                        confirmLabel="Delete market"
                        variant="ghost"
                        size="icon-sm"
                      >
                        <Trash2Icon />
                        <span className="sr-only">Delete market</span>
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
                        option.isWinner && "border-primary text-primary",
                        option.status === "inactive" && "text-muted-foreground line-through",
                      )}
                    >
                      {option.name}
                      <span className="tabular-nums opacity-70">{formatRatio(option.ratio)}</span>
                      {option.bets > 0 ? (
                        <span className="text-muted-foreground tabular-nums">
                          · {option.bets}
                        </span>
                      ) : null}
                    </Badge>
                  ))}
                </div>
              </TableCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
