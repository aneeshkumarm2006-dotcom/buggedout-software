import type { Metadata } from "next";
import Link from "next/link";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { deleteCategoryAction } from "@/app/(admin)/catalog-actions";
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
import { actorCan, requireAdminPage } from "@/lib/admin/guard";
import { listCategories } from "@/lib/admin/categories";
import {
  buildAdminHref,
  parseFilter,
  parsePage,
  parseSearch,
  type SearchParamsRecord,
} from "@/lib/admin/list-params";
import { CONTENT_STATUSES, type ContentStatus } from "@/lib/enums";

export const metadata: Metadata = { title: "Games" };

const PATH = "/admin/categories";

/**
 * Game categories (Phase 6.4). The ten games, their artwork, their market
 * templates and how they sort in the lobby.
 */
export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const actor = await requireAdminPage(["categories.view", "categories.manage"]);
  const params = await searchParams;

  const page = parsePage(params.page);
  const q = parseSearch(params.q);
  const status = parseFilter<ContentStatus>(params.status, CONTENT_STATUSES);

  const categories = await listCategories({ page, q, status });
  const canManage = actorCan(actor, "categories.manage");
  const query = { q, status };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Games"
        description="The kinds of event you run. Each one has its artwork, where it sits in the lobby, and the ready-made betting questions offered when you build an event for it."
        action={
          canManage ? (
            <Button asChild size="lg">
              <Link href={`${PATH}/new`}>
                <PlusIcon />
                New game
              </Link>
            </Button>
          ) : null
        }
      />

      <ListToolbar
        pathname={PATH}
        params={query}
        searchPlaceholder="Title or slug…"
        filters={[
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
              <TableHead className="pl-4">Game</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Order</TableHead>
              <TableHead className="text-right">Templates</TableHead>
              <TableHead className="text-right">Teams</TableHead>
              <TableHead className="text-right">Matches</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {categories.rows.length === 0 ? (
              <TableEmptyRow colSpan={7}>
                {q || status ? "No games match those filters." : "No games yet."}
              </TableEmptyRow>
            ) : (
              categories.rows.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-muted ring-foreground/10 relative h-9 w-16 shrink-0 overflow-hidden rounded ring-1">
                        <AssetImage src={category.cardImage} alt="" fill className="object-cover" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-medium">{category.title}</p>
                        <p className="text-muted-foreground truncate text-xs">/{category.slug}</p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant={category.status === "active" ? "secondary" : "outline"}>
                      {category.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right tabular-nums">{category.sortOrder}</TableCell>
                  <TableCell className="text-right tabular-nums">{category.templateCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{category.teamCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{category.matchCount}</TableCell>

                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`${PATH}/${category.id}`}>
                          <PencilIcon />
                          {canManage ? "Edit" : "View"}
                        </Link>
                      </Button>

                      {canManage ? (
                        <ConfirmActionButton
                          action={deleteCategoryAction.bind(null, category.id)}
                          title={`Delete ${category.title}?`}
                          description="This only works while no teams, tournaments or matches point at it. Setting it inactive hides it from the lobby without touching history."
                          confirmLabel="Delete game"
                          variant="ghost"
                          size="icon-sm"
                        >
                          <Trash2Icon />
                          <span className="sr-only">Delete {category.title}</span>
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
        page={categories.page}
        totalPages={categories.totalPages}
        totalItems={categories.total}
        itemLabel="games"
        buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
      />
    </div>
  );
}
