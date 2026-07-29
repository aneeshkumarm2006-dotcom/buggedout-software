import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

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
import { requireAdminPage } from "@/lib/admin/guard";
import {
  buildAdminHref,
  parseFilter,
  parsePage,
  parseSearch,
  type SearchParamsRecord,
} from "@/lib/admin/list-params";
import { listUsers } from "@/lib/admin/users";
import { USER_STATUSES, type UserStatus } from "@/lib/enums";
import { formatCoins } from "@/lib/format";
import { ROLES, type Role } from "@/lib/roles";

export const metadata: Metadata = { title: "Users" };

const PATH = "/admin/users";

const ROLE_LABEL: Record<Role, string> = {
  user: "User",
  staff: "Staff",
  admin: "Admin",
  superadmin: "Super admin",
};

/** Every account (Phase 6.13). Searchable by name, email or referral code. */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireAdminPage("users.view");
  const params = await searchParams;

  const page = parsePage(params.page);
  const q = parseSearch(params.q);
  const role = parseFilter<Role>(params.role, ROLES);
  const status = parseFilter<UserStatus>(params.status, USER_STATUSES);

  const users = await listUsers({ page, q, role, status });
  const query = { q, role, status };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        description="Balances, bets and bans. Open an account to see everything that has moved on it."
      />

      <ListToolbar
        pathname={PATH}
        params={query}
        searchPlaceholder="Name, email or referral code…"
        filters={[
          {
            name: "role",
            label: "Role",
            value: role,
            allLabel: "All roles",
            options: ROLES.map((value) => ({ value, label: ROLE_LABEL[value] })),
          },
          {
            name: "status",
            label: "Status",
            value: status,
            options: USER_STATUSES.map((value) => ({
              value,
              label: value === "active" ? "Active" : "Banned",
            })),
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
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {users.rows.length === 0 ? (
              <TableEmptyRow colSpan={6}>
                {q || role || status ? "No accounts match those filters." : "No accounts yet."}
              </TableEmptyRow>
            ) : (
              users.rows.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="pl-4">
                    <p className="font-medium">{user.username}</p>
                    <p className="text-muted-foreground text-xs">{user.email}</p>
                  </TableCell>

                  <TableCell>
                    <Badge variant={user.role === "user" ? "outline" : "secondary"}>
                      {ROLE_LABEL[user.role]}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <Badge variant={user.status === "active" ? "secondary" : "destructive"}>
                      {user.status === "active" ? "Active" : "Banned"}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCoins(user.coinBalance)}
                  </TableCell>

                  <TableCell className="text-muted-foreground text-xs">
                    <LocalTime value={user.createdAt} format="date" />
                  </TableCell>

                  <TableCell className="pr-4 text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`${PATH}/${user.id}`}>
                        Open
                        <ArrowRightIcon />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>

      <PaginationNav
        page={users.page}
        totalPages={users.totalPages}
        totalItems={users.total}
        itemLabel="accounts"
        buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
      />
    </div>
  );
}
