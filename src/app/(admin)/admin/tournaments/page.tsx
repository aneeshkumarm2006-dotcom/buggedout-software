import type { Metadata } from "next";
import Link from "next/link";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { deleteTournamentAction } from "@/app/(admin)/catalog-actions";
import { ConfirmActionButton } from "@/components/admin/action-button";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listCategoryOptions } from "@/lib/admin/categories";
import { actorCan, requireAdminPage } from "@/lib/admin/guard";
import {
  buildAdminHref,
  parseFilter,
  parseIdFilter,
  parsePage,
  parseSearch,
  type SearchParamsRecord,
} from "@/lib/admin/list-params";
import { listTournaments } from "@/lib/admin/tournaments";
import { TOURNAMENT_STATUSES, type TournamentStatus } from "@/lib/enums";

export const metadata: Metadata = { title: "Tournaments" };

const PATH = "/admin/tournaments";

/** Tournaments (Phase 6.5) — an optional grouping for a game's matches. */
export default async function AdminTournamentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const actor = await requireAdminPage(["tournaments.view", "tournaments.manage"]);
  const params = await searchParams;

  const page = parsePage(params.page);
  const q = parseSearch(params.q);
  const status = parseFilter<TournamentStatus>(params.status, TOURNAMENT_STATUSES);
  const categoryId = parseIdFilter(params.categoryId);

  const [tournaments, categories] = await Promise.all([
    listTournaments({ page, q, status, categoryId }),
    listCategoryOptions(),
  ]);

  const canManage = actorCan(actor, "tournaments.manage");
  const query = { q, status, categoryId };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tournaments"
        description="Group a game's matches over a date range. A match can also stand on its own."
        action={
          canManage ? (
            <Button asChild size="lg">
              <Link href={`${PATH}/new`}>
                <PlusIcon />
                New tournament
              </Link>
            </Button>
          ) : null
        }
      />

      <ListToolbar
        pathname={PATH}
        params={query}
        searchPlaceholder="Tournament title…"
        filters={[
          {
            name: "categoryId",
            label: "Game",
            value: categoryId,
            allLabel: "All games",
            options: categories.map((category) => ({
              value: category.id,
              label: category.title,
            })),
          },
          {
            name: "status",
            label: "Status",
            value: status,
            options: TOURNAMENT_STATUSES.map((value) => ({
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
              <TableHead className="pl-4">Tournament</TableHead>
              <TableHead>Game</TableHead>
              <TableHead>Runs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Matches</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {tournaments.rows.length === 0 ? (
              <TableEmptyRow colSpan={6}>
                {q || status || categoryId
                  ? "No tournaments match those filters."
                  : "No tournaments yet."}
              </TableEmptyRow>
            ) : (
              tournaments.rows.map((tournament) => (
                <TableRow key={tournament.id}>
                  <TableCell className="pl-4 font-medium">{tournament.title}</TableCell>
                  <TableCell className="text-muted-foreground">{tournament.categoryTitle}</TableCell>

                  <TableCell className="text-muted-foreground text-xs">
                    <LocalTime value={tournament.startDate} format="date" />
                    {" → "}
                    <LocalTime value={tournament.endDate} format="date" />
                  </TableCell>

                  <TableCell>
                    <Badge variant={tournament.status === "ongoing" ? "secondary" : "outline"}>
                      {tournament.status[0]!.toUpperCase() + tournament.status.slice(1)}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    <Link
                      href={buildAdminHref("/admin/matches", { tournamentId: tournament.id })}
                      className="hover:text-primary"
                    >
                      {tournament.matchCount}
                    </Link>
                  </TableCell>

                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`${PATH}/${tournament.id}`}>
                          <PencilIcon />
                          {canManage ? "Edit" : "View"}
                        </Link>
                      </Button>

                      {canManage ? (
                        <ConfirmActionButton
                          action={deleteTournamentAction.bind(null, tournament.id)}
                          title={`Delete ${tournament.title}?`}
                          description="Only possible while no matches belong to it."
                          confirmLabel="Delete tournament"
                          variant="ghost"
                          size="icon-sm"
                        >
                          <Trash2Icon />
                          <span className="sr-only">Delete {tournament.title}</span>
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
        page={tournaments.page}
        totalPages={tournaments.totalPages}
        totalItems={tournaments.total}
        itemLabel="tournaments"
        buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
      />
    </div>
  );
}
