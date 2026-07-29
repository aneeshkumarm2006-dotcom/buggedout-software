import type { Metadata } from "next";
import Link from "next/link";
import {
  CoinsIcon,
  GavelIcon,
  LifeBuoyIcon,
  SwordsIcon,
  TicketIcon,
  UsersIcon,
} from "lucide-react";

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
import { BetStatusBadge } from "@/components/common/status-badge";
import { getAdminDashboard } from "@/lib/admin/dashboard";
import { requireAdminPage } from "@/lib/admin/guard";
import { formatCoins, formatRatio } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Admin dashboard (Phase 6.2): the numbers worth knowing on arrival, and the
 * last ten bets so a quiet afternoon looks obviously different from a broken
 * one. The two queue cards link straight into the work they represent.
 */
export default async function AdminDashboardPage() {
  await requireAdminPage("dashboard.view");

  const { stats, recentBets, since } = await getAdminDashboard();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          <>
            Everything counted from midnight UTC (
            <LocalTime value={since} format="short" />
            &nbsp;your time).
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard
          label="Active matches"
          value={formatCoins(stats.matches.active)}
          hint={`${stats.matches.live} live now`}
          icon={SwordsIcon}
          href="/admin/matches"
        />
        <StatCard
          label="Finished matches"
          value={formatCoins(stats.matches.inactive)}
          hint="Resolved or cancelled"
          icon={SwordsIcon}
        />
        <StatCard
          label="Matches today"
          value={formatCoins(stats.matches.today)}
          hint={`${formatCoins(stats.matches.thisMonth)} this month`}
          icon={SwordsIcon}
        />
        <StatCard
          label="Users"
          value={formatCoins(stats.users.total)}
          hint={`${formatCoins(stats.users.newToday)} joined today · ${formatCoins(stats.users.banned)} banned`}
          icon={UsersIcon}
          href="/admin/users"
        />
        <StatCard
          label="Bets today"
          value={formatCoins(stats.bets.today)}
          hint={`${formatCoins(stats.bets.pending)} still open`}
          icon={TicketIcon}
          href="/admin/bets"
        />
        <StatCard
          label="Coins staked today"
          value={formatCoins(stats.bets.stakedToday)}
          hint={`${formatCoins(stats.bets.stakedAllTime)} all time`}
          icon={CoinsIcon}
        />
        <StatCard
          label="Awaiting a result"
          value={formatCoins(stats.queues.pendingResults)}
          hint="Go to pending results"
          icon={GavelIcon}
          href="/admin/results/pending"
          emphasis={stats.queues.pendingResults > 0}
        />
        <StatCard
          label="Open tickets"
          value={formatCoins(stats.queues.openTickets)}
          hint="Go to support"
          icon={LifeBuoyIcon}
          href="/admin/support"
          emphasis={stats.queues.openTickets > 0}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold">Recent bets</h2>
          <Link href="/admin/bets" className="text-primary text-sm hover:underline">
            View all
          </Link>
        </div>

        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">User</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Selection</TableHead>
                <TableHead className="text-right">Stake</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Placed</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {recentBets.length === 0 ? (
                <TableEmptyRow colSpan={6}>No bets have been placed yet.</TableEmptyRow>
              ) : (
                recentBets.map((bet) => (
                  <TableRow key={bet.id}>
                    <TableCell className="pl-4 font-medium">
                      <Link href={`/admin/users/${bet.userId}`} className="hover:text-primary">
                        {bet.username}
                      </Link>
                    </TableCell>

                    <TableCell className="text-muted-foreground max-w-56 truncate">
                      <span className="text-foreground">{bet.matchTitle}</span>
                      <span className="mx-1.5">·</span>
                      {bet.questionText}
                    </TableCell>

                    <TableCell>
                      {bet.optionName}
                      <span className="text-muted-foreground ml-1.5 tabular-nums">
                        {formatRatio(bet.ratio)}
                      </span>
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {formatCoins(bet.stake)}
                    </TableCell>

                    <TableCell>
                      <BetStatusBadge status={bet.status} />
                    </TableCell>

                    <TableCell className="text-muted-foreground pr-4 text-right text-xs">
                      <LocalTime value={bet.placedAt} format="short" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableCard>
      </section>
    </div>
  );
}
