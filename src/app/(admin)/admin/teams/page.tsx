import type { Metadata } from "next";
import Link from "next/link";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { deleteTeamAction } from "@/app/(admin)/catalog-actions";
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
import { AssetImage } from "@/components/common/asset-image";
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
import { listTeams } from "@/lib/admin/teams";
import { CONTENT_STATUSES, TEAM_IMAGE_SIZE, type ContentStatus } from "@/lib/enums";

export const metadata: Metadata = { title: "Competitors" };

const PATH = "/admin/teams";

/** Teams (Phase 6.6) — the competitors a match is built from. */
export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const actor = await requireAdminPage(["teams.view", "teams.manage"]);
  const params = await searchParams;

  const page = parsePage(params.page);
  const q = parseSearch(params.q);
  const status = parseFilter<ContentStatus>(params.status, CONTENT_STATUSES);
  const categoryId = parseIdFilter(params.categoryId);

  const [teams, categories] = await Promise.all([
    listTeams({ page, q, status, categoryId }),
    listCategoryOptions(),
  ]);

  const canManage = actorCan(actor, "teams.manage");
  const query = { q, status, categoryId };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Competitors"
        description="Whatever players pick between — a turtle, a lane, a door. Each one belongs to a single game and can be used on every event for it."
        action={
          canManage ? (
            <Button asChild size="lg">
              <Link href={`${PATH}/new`}>
                <PlusIcon />
                New team
              </Link>
            </Button>
          ) : null
        }
      />

      <ListToolbar
        pathname={PATH}
        params={query}
        searchPlaceholder="Team name…"
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
            options: CONTENT_STATUSES.map((value) => ({
              value,
              label: value === "active" ? "Active" : "Inactive",
            })),
          },
        ]}
      />

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Team</TableHead>
              <TableHead>Game</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Matches</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {teams.rows.length === 0 ? (
              <TableEmptyRow colSpan={5}>
                {q || status || categoryId ? "No teams match those filters." : "No teams yet."}
              </TableEmptyRow>
            ) : (
              teams.rows.map((team) => (
                <TableRow key={team.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <AssetImage
                        src={team.image}
                        alt=""
                        width={TEAM_IMAGE_SIZE}
                        height={TEAM_IMAGE_SIZE}
                        className="ring-foreground/10 size-8 rounded-full object-cover ring-1"
                      />
                      <span className="font-medium">{team.name}</span>
                    </div>
                  </TableCell>

                  <TableCell className="text-muted-foreground">{team.categoryTitle}</TableCell>

                  <TableCell>
                    <Badge variant={team.status === "active" ? "secondary" : "outline"}>
                      {team.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right tabular-nums">{team.matchCount}</TableCell>

                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`${PATH}/${team.id}`}>
                          <PencilIcon />
                          {canManage ? "Edit" : "View"}
                        </Link>
                      </Button>

                      {canManage ? (
                        <ConfirmActionButton
                          action={deleteTeamAction.bind(null, team.id)}
                          title={`Delete ${team.name}?`}
                          description="Only possible while the team is in no matches. Otherwise set it inactive."
                          confirmLabel="Delete team"
                          variant="ghost"
                          size="icon-sm"
                        >
                          <Trash2Icon />
                          <span className="sr-only">Delete {team.name}</span>
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
        page={teams.page}
        totalPages={teams.totalPages}
        totalItems={teams.total}
        itemLabel="teams"
        buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
      />
    </div>
  );
}
