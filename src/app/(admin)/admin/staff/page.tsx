import type { Metadata } from "next";
import Link from "next/link";
import { PencilIcon, PlusIcon, ShieldCheckIcon } from "lucide-react";

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
import { actorCan, requireAdminPage } from "@/lib/admin/guard";
import {
  buildAdminHref,
  parseFilter,
  parsePage,
  parseSearch,
  type SearchParamsRecord,
} from "@/lib/admin/list-params";
import { listStaff } from "@/lib/admin/users";
import { ADMIN_PANEL_ROLES, type Role } from "@/lib/roles";

export const metadata: Metadata = { title: "Staff" };

const PATH = "/admin/staff";

const ROLE_LABEL: Record<Role, string> = {
  user: "User",
  staff: "Staff",
  admin: "Admin",
  superadmin: "Super admin",
};

/** Who can get into the panel, and what they can do once they are in (Phase 6.3). */
export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const actor = await requireAdminPage(["staff.view", "staff.manage"]);
  const params = await searchParams;

  const page = parsePage(params.page);
  const q = parseSearch(params.q);
  const role = parseFilter<Role>(params.role, ADMIN_PANEL_ROLES);

  const staff = await listStaff(actor.id, { page, q, role });
  const canManage = actorCan(actor, "staff.manage");
  const query = { q, role };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Staff"
        description="Who can get into this panel, and what each of them is allowed to do. Everything is checked again on every single request, so removing access takes effect immediately."
        action={
          canManage ? (
            <Button asChild size="lg">
              <Link href={`${PATH}/new`}>
                <PlusIcon />
                Add staff
              </Link>
            </Button>
          ) : null
        }
      />

      <ListToolbar
        pathname={PATH}
        params={query}
        searchPlaceholder="Name or email…"
        filters={[
          {
            name: "role",
            label: "Role",
            value: role,
            allLabel: "All roles",
            options: ADMIN_PANEL_ROLES.map((value) => ({ value, label: ROLE_LABEL[value] })),
          },
        ]}
      />

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Account</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Permissions</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {staff.rows.length === 0 ? (
              <TableEmptyRow colSpan={6}>
                {q || role ? "No staff match those filters." : "No staff accounts yet."}
              </TableEmptyRow>
            ) : (
              staff.rows.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="pl-4">
                    <p className="font-medium">
                      {member.username}
                      {member.isSelf ? (
                        <span className="text-muted-foreground text-xs"> · you</span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground text-xs">{member.email}</p>
                  </TableCell>

                  <TableCell>
                    <Badge variant={member.role === "superadmin" ? "default" : "outline"}>
                      {ROLE_LABEL[member.role]}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <Badge variant={member.status === "active" ? "secondary" : "destructive"}>
                      {member.status === "active" ? "Active" : "Banned"}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {member.role === "superadmin" ? (
                      <span className="text-primary inline-flex items-center gap-1 text-xs">
                        <ShieldCheckIcon className="size-3.5" />
                        All
                      </span>
                    ) : (
                      member.permissionCount
                    )}
                  </TableCell>

                  <TableCell className="text-muted-foreground text-xs">
                    <LocalTime value={member.createdAt} format="date" />
                  </TableCell>

                  <TableCell className="pr-4 text-right">
                    {canManage ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`${PATH}/${member.id}`}>
                          <PencilIcon />
                          Edit
                        </Link>
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>

      <PaginationNav
        page={staff.page}
        totalPages={staff.totalPages}
        totalItems={staff.total}
        itemLabel="staff"
        buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
      />
    </div>
  );
}
