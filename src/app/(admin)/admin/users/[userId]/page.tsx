import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BanIcon, CheckIcon, CoinsIcon, TicketIcon, TrendingUpIcon, UsersIcon } from "lucide-react";

import { adjustCoinsAction, setUserStatusAction } from "@/app/(admin)/people-actions";
import { ConfirmActionButton } from "@/components/admin/action-button";
import { CoinAdjustForm } from "@/components/admin/coin-adjust-form";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actorCan, requireAdminPage } from "@/lib/admin/guard";
import { buildAdminHref } from "@/lib/admin/list-params";
import { getUserDetail } from "@/lib/admin/users";
import { formatCoins, formatRatio, formatSignedCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Account" };

const TRANSACTION_LABEL: Record<string, string> = {
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
 * One account, end to end (Phase 6.13): what it holds, what it has wagered,
 * what has moved on it, and the two levers an admin has — the ban switch and a
 * manual adjustment, both of which write an audit row.
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const actor = await requireAdminPage("users.view", { fallback: "/admin/users" });

  const { userId } = await params;
  const user = await getUserDetail(userId);

  if (!user) notFound();

  const canBan = actorCan(actor, "users.ban");
  const canAdjust = actorCan(actor, "users.adjust_coins");
  const canSeeLedger = actorCan(actor, "transactions.view");
  const canSeeBets = actorCan(actor, "bets.view");
  const banned = user.status === "banned";

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.username}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{user.email}</span>
            <Badge variant={banned ? "destructive" : "secondary"}>
              {banned ? "Banned" : "Active"}
            </Badge>
            {user.role !== "user" ? <Badge variant="outline">{user.role}</Badge> : null}
            <span className="text-muted-foreground text-xs">
              joined <LocalTime value={user.createdAt} format="date" />
            </span>
          </span>
        }
        backHref="/admin/users"
        backLabel="Users"
        action={
          canBan && user.id !== actor.id ? (
            <ConfirmActionButton
              action={setUserStatusAction.bind(null, user.id, banned ? "active" : "banned")}
              title={banned ? `Unban ${user.username}?` : `Ban ${user.username}?`}
              description={
                banned
                  ? "They will be able to log in and bet again immediately."
                  : "They can no longer log in, claim bonuses or place bets. Outstanding bets still settle normally."
              }
              confirmLabel={banned ? "Unban account" : "Ban account"}
              confirmVariant={banned ? "default" : "destructive"}
              reason={{
                label: "Reason",
                placeholder: banned ? "Appeal upheld…" : "Abuse of the daily bonus…",
              }}
              variant={banned ? "outline" : "destructive"}
              size="lg"
            >
              {banned ? <CheckIcon /> : <BanIcon />}
              {banned ? "Unban" : "Ban"}
            </ConfirmActionButton>
          ) : null
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Balance" value={formatCoins(user.coinBalance)} icon={CoinsIcon} />
        <StatCard
          label="Bets"
          value={formatCoins(user.stats.bets)}
          hint={`${formatCoins(user.stats.pending)} open`}
          icon={TicketIcon}
        />
        <StatCard label="Staked" value={formatCoins(user.stats.staked)} icon={CoinsIcon} />
        <StatCard label="Returned" value={formatCoins(user.stats.returned)} icon={CoinsIcon} />
        <StatCard
          label="Net result"
          value={formatSignedCoins(user.stats.net)}
          hint="Returns minus stakes"
          icon={TrendingUpIcon}
          emphasis={user.stats.net > 0}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <TableCard className="space-y-3 p-4">
          <h2 className="font-heading text-base font-semibold">Account</h2>

          <dl className="grid gap-2 text-sm">
            <Row label="Referral code" value={<code className="text-xs">{user.referralCode}</code>} />
            <Row
              label="Referred by"
              value={user.referredByUsername ?? <span className="text-muted-foreground">—</span>}
            />
            <Row
              label="Has referred"
              value={
                <span className="tabular-nums">
                  {formatCoins(user.referredCount)} account
                  {user.referredCount === 1 ? "" : "s"}
                </span>
              }
            />
            <Row
              label="Last daily bonus"
              value={
                user.lastDailyBonusAt ? (
                  <LocalTime value={user.lastDailyBonusAt} format="short" />
                ) : (
                  <span className="text-muted-foreground">Never claimed</span>
                )
              }
            />
          </dl>

          <div className="flex flex-wrap gap-2 pt-1">
            {canSeeBets ? (
              <Button asChild variant="outline" size="sm">
                <Link href={buildAdminHref("/admin/bets", { q: user.username })}>
                  <TicketIcon />
                  All bets
                </Link>
              </Button>
            ) : null}

            {canSeeLedger ? (
              <Button asChild variant="outline" size="sm">
                <Link href={buildAdminHref("/admin/transactions", { q: user.username })}>
                  <CoinsIcon />
                  Full ledger
                </Link>
              </Button>
            ) : null}

            {user.role !== "user" ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/staff/${user.id}`}>
                  <UsersIcon />
                  Permissions
                </Link>
              </Button>
            ) : null}
          </div>
        </TableCard>

        {canAdjust ? (
          <CoinAdjustForm
            action={adjustCoinsAction.bind(null, user.id)}
            username={user.username}
          />
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Recent bets</h2>

        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Selection</TableHead>
                <TableHead className="text-right">Stake</TableHead>
                <TableHead className="text-right">Returned</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Placed</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {user.recentBets.length === 0 ? (
                <TableEmptyRow colSpan={5}>This account hasn&apos;t bet yet.</TableEmptyRow>
              ) : (
                user.recentBets.map((bet) => (
                  <TableRow key={bet.id}>
                    <TableCell className="pl-4">
                      <Link
                        href={`/admin/matches/${bet.matchId}/questions`}
                        className="font-medium hover:text-primary"
                      >
                        {bet.optionName}
                      </Link>
                      <span className="text-muted-foreground ml-1.5 tabular-nums">
                        {formatRatio(bet.ratio)}
                      </span>
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {formatCoins(bet.stake)}
                    </TableCell>

                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        bet.payout > 0 && "text-primary font-medium",
                      )}
                    >
                      {bet.payout > 0 ? formatCoins(bet.payout) : "—"}
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

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Recent transactions</h2>

        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Type</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance after</TableHead>
                <TableHead className="pr-4 text-right">When</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {user.recentTransactions.length === 0 ? (
                <TableEmptyRow colSpan={5}>Nothing has moved on this account.</TableEmptyRow>
              ) : (
                user.recentTransactions.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-4 font-medium">
                      {TRANSACTION_LABEL[row.type] ?? row.type}
                    </TableCell>

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
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
