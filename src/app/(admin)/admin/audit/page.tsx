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
import { Badge } from "@/components/ui/badge";
import { listAuditLog } from "@/lib/admin/audit";
import { requireAdminPage } from "@/lib/admin/guard";
import {
  buildAdminHref,
  parseFilter,
  parsePage,
  parseSearch,
  type SearchParamsRecord,
} from "@/lib/admin/list-params";
import { AUDIT_ENTITY_TYPES, type AuditEntityType } from "@/lib/enums";

export const metadata: Metadata = { title: "Activity log" };

const PATH = "/admin/audit";

/** Where an entity's own screen lives, when the row points at something openable. */
const ENTITY_HREF: Partial<Record<AuditEntityType, (id: string) => string>> = {
  user: (id) => `/admin/users/${id}`,
  gameCategory: (id) => `/admin/categories/${id}`,
  tournament: (id) => `/admin/tournaments/${id}`,
  team: (id) => `/admin/teams/${id}`,
  match: (id) => `/admin/matches/${id}`,
  supportTicket: (id) => `/admin/support/${id}`,
};

/**
 * The audit trail (Phase 6.1's audit-log requirement, given its own screen).
 *
 * Append-only at the model level, so nothing here can have been quietly edited
 * out. The metadata differs per action by design — a resolve carries payout
 * totals, a ban carries a reason — so it renders as key/value pairs rather than
 * being forced into columns that would be empty most of the time.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireAdminPage("audit.view");
  const params = await searchParams;

  const page = parsePage(params.page);
  const q = parseSearch(params.q);
  const entityType = parseFilter<AuditEntityType>(params.entityType, AUDIT_ENTITY_TYPES);

  const log = await listAuditLog({ page, q, entityType });
  const query = { q, entityType };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity log"
        description="Everything staff have done here, newest first. Nothing on this page can be edited or deleted — that's the point of it."
      />

      <ListToolbar
        pathname={PATH}
        params={query}
        searchPlaceholder="Action or admin name…"
        filters={[
          {
            name: "entityType",
            label: "Entity",
            value: entityType,
            allLabel: "Everything",
            options: AUDIT_ENTITY_TYPES.map((value) => ({ value, label: humanise(value) })),
          },
        ]}
      />

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Action</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>IP</TableHead>
              <TableHead className="pr-4 text-right">When</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {log.rows.length === 0 ? (
              <TableEmptyRow colSpan={6}>
                {q || entityType ? "No entries match those filters." : "Nothing has been logged yet."}
              </TableEmptyRow>
            ) : (
              log.rows.map((row) => {
                const href = row.entityId ? ENTITY_HREF[row.entityType]?.(row.entityId) : undefined;

                return (
                  <TableRow key={row.id}>
                    <TableCell className="pl-4">
                      <code className="text-xs font-medium">{row.action}</code>
                    </TableCell>

                    <TableCell>
                      <Link href={`/admin/users/${row.actorId}`} className="hover:text-primary">
                        {row.actorName}
                      </Link>
                      <span className="text-muted-foreground ml-1.5 text-xs">{row.actorRole}</span>
                    </TableCell>

                    <TableCell>
                      {href ? (
                        <Link href={href} className="hover:text-primary">
                          <Badge variant="outline">{humanise(row.entityType)}</Badge>
                        </Link>
                      ) : (
                        <Badge variant="outline">{humanise(row.entityType)}</Badge>
                      )}
                    </TableCell>

                    <TableCell className="max-w-80">
                      <MetadataCell metadata={row.metadata} />
                    </TableCell>

                    <TableCell className="text-muted-foreground text-xs">{row.ip ?? "—"}</TableCell>

                    <TableCell className="text-muted-foreground pr-4 text-right text-xs">
                      <LocalTime value={row.createdAt} format="short" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableCard>

      <PaginationNav
        page={log.page}
        totalPages={log.totalPages}
        totalItems={log.total}
        itemLabel="entries"
        buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
      />
    </div>
  );
}

/** Free-form metadata, flattened to `key: value` and truncated to fit a row. */
function MetadataCell({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata) return <span className="text-muted-foreground text-xs">—</span>;

  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );

  if (entries.length === 0) return <span className="text-muted-foreground text-xs">—</span>;

  return (
    <p className="text-muted-foreground truncate text-xs" title={entries.map(pair).join(" · ")}>
      {entries.slice(0, 4).map(pair).join(" · ")}
      {entries.length > 4 ? " …" : ""}
    </p>
  );
}

function pair([key, value]: [string, unknown]): string {
  const rendered = Array.isArray(value)
    ? value.join(", ")
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

  return `${key}: ${rendered.length > 60 ? `${rendered.slice(0, 60)}…` : rendered}`;
}

/** `gameCategory` → `Game category`. */
function humanise(value: string): string {
  const spaced = value.replace(/([A-Z])/g, " $1").toLowerCase();
  return spaced[0]!.toUpperCase() + spaced.slice(1);
}
