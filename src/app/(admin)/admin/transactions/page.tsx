import type { Metadata } from "next";
import Link from "next/link";

import { ListToolbar } from "@/components/admin/list-toolbar";
import { StatCard } from "@/components/admin/stat-card";
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
import { requireAdminPage } from "@/lib/admin/guard";
import { listTransactions } from "@/lib/admin/ledger";
import {
  buildAdminHref,
  parseFilter,
  parsePage,
  parseSearch,
  type SearchParamsRecord,
} from "@/lib/admin/list-params";
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/enums";
import { formatCoins, formatSignedCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Coin history" };

const PATH = "/admin/transactions";

const TYPE_LABEL: Record<TransactionType, string> = {
  signup_bonus: "Signup bonus",
  daily_bonus: "Daily bonus",
  bet_place: "Bet placed",
  bet_win: "Bet won",
  bet_refund: "Refund",
  admin_credit: "Admin credit",
  admin_debit: "Admin debit",
  referral_commission: "Referral",
};

/**
 * The global ledger (Phase 6.12).
 *
 * Append-only at the model level, so this is a complete and unedited history of
 * every coin that has ever moved — `balanceAfter` on each row is the balance
 * that movement landed on, which is what makes it auditable without replaying
 * anything.
 */
export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireAdminPage("transactions.view");
  const params = await searchParams;

  const page = parsePage(params.page);
  const q = parseSearch(params.q);
  const type = parseFilter<TransactionType>(params.type, TRANSACTION_TYPES);

  const ledger = await listTransactions({ page, q, type });
  const query = { q, type };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        description="Every coin movement on the platform. The ledger is append-only — corrections are new rows, never edits."
      />

      <ListToolbar
        pathname={PATH}
        params={query}
        searchPlaceholder="Username or email…"
        filters={[
          {
            name: "type",
            label: "Type",
            value: type,
            allLabel: "All types",
            options: TRANSACTION_TYPES.map((value) => ({ value, label: TYPE_LABEL[value] })),
          },
        ]}
      />

      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Credits" value={formatCoins(ledger.totals.credits)} hint="In this view" />
        <StatCard label="Debits" value={formatCoins(ledger.totals.debits)} hint="In this view" />
        <StatCard
          label="Net"
          value={formatSignedCoins(ledger.totals.net)}
          hint="Credits minus debits"
          emphasis={ledger.totals.net > 0}
        />
      </section>

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">User</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance after</TableHead>
              <TableHead className="pr-4 text-right">When</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {ledger.rows.length === 0 ? (
              <TableEmptyRow colSpan={6}>
                {q || type ? "No transactions match those filters." : "Nothing has moved yet."}
              </TableEmptyRow>
            ) : (
              ledger.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="pl-4 font-medium">
                    <Link href={`/admin/users/${row.userId}`} className="hover:text-primary">
                      {row.username}
                    </Link>
                  </TableCell>

                  <TableCell>{TYPE_LABEL[row.type]}</TableCell>

                  <TableCell className="text-muted-foreground max-w-64 truncate">
                    {row.note ?? "—"}
                  </TableCell>

                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      row.amount > 0 ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {formatSignedCoins(row.amount)}
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {formatCoins(row.balanceAfter)}
                  </TableCell>

                  <TableCell className="text-muted-foreground pr-4 text-right text-xs">
                    <LocalTime value={row.createdAt} format="short" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>

      <PaginationNav
        page={ledger.page}
        totalPages={ledger.totalPages}
        totalItems={ledger.total}
        itemLabel="transactions"
        buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
      />
    </div>
  );
}
