import type { Metadata } from "next";
import Link from "next/link";
import { BanIcon, ListChecksIcon, LockIcon, PencilIcon, PlusIcon, Trash2Icon, UnlockIcon } from "lucide-react";

import { cancelMatchAction } from "@/app/(admin)/actions";
import { deleteMatchAction, setMatchStatusAction } from "@/app/(admin)/catalog-actions";
import { ActionButton, ConfirmActionButton } from "@/components/admin/action-button";
import { FlashToast } from "@/components/admin/flash-toast";
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
import { AssetImage } from "@/components/common/asset-image";
import { LocalTime } from "@/components/common/local-time";
import { PageHeader } from "@/components/common/page-header";
import { PaginationNav } from "@/components/common/pagination-nav";
import { MatchStatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { listCategoryOptions } from "@/lib/admin/categories";
import { actorCan, requireAdminPage } from "@/lib/admin/guard";
import {
  buildAdminHref,
  parseFilter,
  parseFlash,
  parseIdFilter,
  parsePage,
  parseSearch,
  type SearchParamsRecord,
} from "@/lib/admin/list-params";
import { listMatches } from "@/lib/admin/matches";
import { listTournamentOptions } from "@/lib/admin/tournaments";
import { MATCH_STATUSES, TEAM_IMAGE_SIZE, type MatchStatus } from "@/lib/enums";

export const metadata: Metadata = { title: "Matches" };

const PATH = "/admin/matches";

/**
 * Matches (Phase 6.7).
 *
 * The row actions are the day-to-day ones: lock a match the moment the animals
 * are off, open its market list, or cancel it — which is the only path that
 * refunds, and is deliberately not reachable from the status dropdown.
 */
export default async function AdminMatchesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const actor = await requireAdminPage(["matches.view", "matches.manage"]);
  const params = await searchParams;

  const page = parsePage(params.page);
  const q = parseSearch(params.q);
  const status = parseFilter<MatchStatus>(params.status, MATCH_STATUSES);
  const categoryId = parseIdFilter(params.categoryId);
  const tournamentId = parseIdFilter(params.tournamentId);

  const [matches, categories, tournaments] = await Promise.all([
    listMatches({ page, q, status, categoryId, tournamentId }),
    listCategoryOptions(),
    listTournamentOptions(),
  ]);

  const canManage = actorCan(actor, "matches.manage");
  const canVoid = actorCan(actor, "results.void");
  const canSeeQuestions = actorCan(actor, "questions.view") || actorCan(actor, "questions.manage");
  const query = { q, status, categoryId, tournamentId };

  return (
    <div className="space-y-5">
      <FlashToast message={parseFlash(params.flash)} />

      <PageHeader
        title="Matches"
        description="Every event users can bet on. Open a match's markets from Questions."
        action={
          canManage ? (
            <Button asChild size="lg">
              <Link href={`${PATH}/new`}>
                <PlusIcon />
                New match
              </Link>
            </Button>
          ) : null
        }
      />

      <ListToolbar
        pathname={PATH}
        params={query}
        searchPlaceholder="Match title…"
        filters={[
          {
            name: "categoryId",
            label: "Game",
            value: categoryId,
            allLabel: "All games",
            options: categories.map((category) => ({ value: category.id, label: category.title })),
          },
          {
            name: "tournamentId",
            label: "Tournament",
            value: tournamentId,
            allLabel: "Any",
            options: tournaments
              .filter((tournament) => !categoryId || tournament.categoryId === categoryId)
              .map((tournament) => ({ value: tournament.id, label: tournament.title })),
          },
          {
            name: "status",
            label: "Status",
            value: status,
            options: MATCH_STATUSES.map((value) => ({
              value,
              label: value[0]!.toUpperCase() + value.slice(1),
            })),
          },
        ]}
      />

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Match</TableHead>
              <TableHead>Teams</TableHead>
              <TableHead>Starts</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Markets</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {matches.rows.length === 0 ? (
              <TableEmptyRow colSpan={6}>
                {q || status || categoryId || tournamentId
                  ? "No matches fit those filters."
                  : "No matches yet."}
              </TableEmptyRow>
            ) : (
              matches.rows.map((match) => (
                <TableRow key={match.id}>
                  <TableCell className="pl-4">
                    <p className="max-w-64 truncate font-medium">{match.title}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {match.categoryTitle}
                      {match.tournamentTitle ? ` · ${match.tournamentTitle}` : ""}
                    </p>
                  </TableCell>

                  <TableCell>
                    <div className="flex -space-x-1.5">
                      {match.teams.map((team) => (
                        <AssetImage
                          key={team.id}
                          src={team.image}
                          alt={team.name}
                          width={TEAM_IMAGE_SIZE}
                          height={TEAM_IMAGE_SIZE}
                          className="ring-card size-7 rounded-full object-cover ring-2"
                        />
                      ))}
                    </div>
                  </TableCell>

                  <TableCell className="text-muted-foreground text-xs">
                    <LocalTime value={match.startTime} format="short" />
                  </TableCell>

                  <TableCell>
                    <MatchStatusBadge status={match.status} />
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {match.questionCount}
                    {match.openQuestionCount > 0 ? (
                      <span className="text-muted-foreground text-xs"> · {match.openQuestionCount} open</span>
                    ) : null}
                  </TableCell>

                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-1.5">
                      {canSeeQuestions ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`${PATH}/${match.id}/questions`}>
                            <ListChecksIcon />
                            Questions
                          </Link>
                        </Button>
                      ) : null}

                      {canManage && match.status !== "cancelled" && match.status !== "resolved" ? (
                        <ActionButton
                          action={setMatchStatusAction.bind(
                            null,
                            match.id,
                            match.status === "locked" ? "live" : "locked",
                          )}
                          variant="ghost"
                          size="icon-sm"
                          title={match.status === "locked" ? "Reopen betting" : "Lock betting"}
                        >
                          {match.status === "locked" ? <UnlockIcon /> : <LockIcon />}
                          <span className="sr-only">
                            {match.status === "locked" ? "Reopen" : "Lock"} {match.title}
                          </span>
                        </ActionButton>
                      ) : null}

                      {canManage ? (
                        <Button asChild variant="ghost" size="icon-sm" title="Edit match">
                          <Link href={`${PATH}/${match.id}`}>
                            <PencilIcon />
                            <span className="sr-only">Edit {match.title}</span>
                          </Link>
                        </Button>
                      ) : null}

                      {canVoid && match.status !== "cancelled" ? (
                        <ConfirmActionButton
                          action={cancelMatchAction.bind(null, match.id)}
                          title={`Cancel ${match.title}?`}
                          description="Every unresolved market on this match is voided and every stake refunded. Markets already resolved keep their payouts."
                          confirmLabel="Cancel and refund"
                          reason={{ label: "Reason", placeholder: "Event abandoned…" }}
                          variant="ghost"
                          size="icon-sm"
                        >
                          <BanIcon />
                          <span className="sr-only">Cancel {match.title}</span>
                        </ConfirmActionButton>
                      ) : null}

                      {canManage ? (
                        <ConfirmActionButton
                          action={deleteMatchAction.bind(null, match.id)}
                          title={`Delete ${match.title}?`}
                          description="Deletes the match and its markets. Only possible while nothing has been staked on it — otherwise cancel it, which refunds."
                          confirmLabel="Delete match"
                          variant="ghost"
                          size="icon-sm"
                        >
                          <Trash2Icon />
                          <span className="sr-only">Delete {match.title}</span>
                        </ConfirmActionButton>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>

      <PaginationNav
        page={matches.page}
        totalPages={matches.totalPages}
        totalItems={matches.total}
        itemLabel="matches"
        buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
      />
    </div>
  );
}
