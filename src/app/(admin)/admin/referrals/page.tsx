import type { Metadata } from "next";
import Link from "next/link";

import { ListToolbar } from "@/components/admin/list-toolbar";
import { ReferralSettingsForm } from "@/components/admin/referral-settings-form";
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
import { actorCan, requireAdminPage } from "@/lib/admin/guard";
import {
  buildAdminHref,
  parsePage,
  parseSearch,
  type SearchParamsRecord,
} from "@/lib/admin/list-params";
import { getReferralSettings, listCommissions } from "@/lib/admin/referrals";
import { formatCoins, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Refer a friend" };

const PATH = "/admin/referrals";

/**
 * The referral programme (Phase 6.11): what it pays, and what it has paid.
 *
 * The log is the `referral_commission` slice of the ledger rather than a second
 * table — there is exactly one record of this money, and it is the one the
 * balances were derived from.
 */
export default async function AdminReferralsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const actor = await requireAdminPage(["referrals.view", "referrals.manage"]);
  const params = await searchParams;

  const page = parsePage(params.page);
  const q = parseSearch(params.q);

  const [settings, commissions] = await Promise.all([
    getReferralSettings(),
    listCommissions({ page, q }),
  ]);

  const canManage = actorCan(actor, "referrals.manage");
  const query = { q };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Refer a friend"
        description={
          settings.enabled
            ? `On — ${formatPercent(settings.commissionPercent)} of each settled bet's ${settings.commissionBasis}.`
            : "Switched off. No new bonuses or commissions are being paid."
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Commission paid" value={formatCoins(commissions.summary.totalPaid)} />
        <StatCard label="Payouts" value={formatCoins(commissions.summary.payouts)} />
        <StatCard
          label="Referred accounts"
          value={formatCoins(commissions.summary.referredAccounts)}
          hint="Signed up with a code"
        />
        <StatCard
          label="Earning referrers"
          value={formatCoins(commissions.summary.activeReferrers)}
          hint="Have been paid at least once"
        />
      </section>

      {canManage ? (
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-semibold">Settings</h2>
          <ReferralSettingsForm settings={settings} />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Commission log</h2>

        <ListToolbar
          pathname={PATH}
          params={query}
          searchPlaceholder="Referrer name or email…"
        />

        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Referrer</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>From</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="pr-4 text-right">When</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {commissions.rows.length === 0 ? (
                <TableEmptyRow colSpan={5}>
                  {q ? "No commissions match that search." : "No commissions have been paid yet."}
                </TableEmptyRow>
              ) : (
                commissions.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-4 font-medium">
                      <Link href={`/admin/users/${row.referrerId}`} className="hover:text-primary">
                        {row.referrerName}
                      </Link>
                    </TableCell>

                    <TableCell className="text-muted-foreground max-w-64 truncate">
                      {row.note ?? "Referral commission"}
                    </TableCell>

                    <TableCell className="text-muted-foreground text-xs">
                      {row.sourceLabel && row.sourceMatchId ? (
                        <Link
                          href={`/admin/matches/${row.sourceMatchId}/questions`}
                          className="hover:text-primary"
                        >
                          {row.sourceLabel}
                        </Link>
                      ) : (
                        (row.sourceLabel ?? "Signup bonus")
                      )}
                    </TableCell>

                    <TableCell className="text-primary text-right font-medium tabular-nums">
                      {formatCoins(row.amount)}
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
          page={commissions.page}
          totalPages={commissions.totalPages}
          totalItems={commissions.total}
          itemLabel="commissions"
          buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
        />
      </section>
    </div>
  );
}
