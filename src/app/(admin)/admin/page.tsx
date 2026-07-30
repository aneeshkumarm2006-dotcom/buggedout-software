import type { Metadata } from "next";
import Link from "next/link";
import {
  GavelIcon,
  LifeBuoyIcon,
  SparklesIcon,
  SwordsIcon,
  TriangleAlertIcon,
  UsersRoundIcon,
} from "lucide-react";

import { HelpNote, TaskCard } from "@/components/admin/help-note";
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
import { Button } from "@/components/ui/button";
import { getAdminDashboard } from "@/lib/admin/dashboard";
import { actorCan, requireAdminPage } from "@/lib/admin/guard";
import { getAdminTasks } from "@/lib/admin/setup";
import { formatCoins, formatRatio } from "@/lib/format";

export const metadata: Metadata = { title: "Home" };

/**
 * The home screen.
 *
 * It used to open on eight statistics, which answer "how is the platform
 * doing" — a question nobody arriving for a shift is asking. They are asking
 * "what needs me", so that is what the top of the page is now: the two queues
 * that hold up money, the two mistakes that are otherwise silent, and one
 * button to build the next event. The numbers are still here, further down,
 * where a number belongs.
 *
 * Every card is permission-filtered the same way the sidebar is, so a support
 * agent's home screen is their queue and nothing they cannot act on.
 */
export default async function AdminHomePage() {
  const actor = await requireAdminPage("dashboard.view");

  const [{ stats, recentBets, since }, tasks] = await Promise.all([
    getAdminDashboard(),
    getAdminTasks(),
  ]);

  const canBuild = actorCan(actor, "matches.manage");
  const canResolve = actorCan(actor, "results.view") || actorCan(actor, "results.resolve");
  const canSupport = actorCan(actor, "support.view") || actorCan(actor, "support.reply");
  const canSeeEvents = actorCan(actor, "matches.view") || canBuild;
  const canSeeBets = actorCan(actor, "bets.view");

  const problems = [
    tasks.eventsWithoutQuestions > 0 && canSeeEvents
      ? {
          href: "/admin/matches",
          text:
            tasks.eventsWithoutQuestions === 1
              ? "One live event has no betting questions on it, so nobody can bet on it."
              : `${tasks.eventsWithoutQuestions} live events have no betting questions on them, so nobody can bet on them.`,
        }
      : null,
    tasks.gamesWithoutCompetitors > 0 && actorCan(actor, "teams.view")
      ? {
          href: "/admin/teams",
          text:
            tasks.gamesWithoutCompetitors === 1
              ? "One game has fewer than two competitors — you can't build an event for it yet."
              : `${tasks.gamesWithoutCompetitors} games have fewer than two competitors — you can't build events for them yet.`,
        }
      : null,
  ].filter((problem): problem is { href: string; text: string } => !!problem);

  const nothingWaiting =
    tasks.resultsWaiting === 0 && tasks.openTickets === 0 && problems.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="What needs doing"
        description="Anything waiting on you is at the top. Everything else is in the menu."
        action={
          canBuild ? (
            <Button asChild size="lg">
              <Link href="/admin/create">
                <SparklesIcon />
                Set up an event
              </Link>
            </Button>
          ) : null
        }
      />

      {nothingWaiting ? (
        <HelpNote title="Nothing is waiting on you right now.">
          <p>
            No results to enter, no unanswered messages, and every live event has questions on it.
            {canBuild ? " Good time to set up the next one." : ""}
          </p>
        </HelpNote>
      ) : null}

      {problems.length > 0 ? (
        <section className="border-brand-gold/30 bg-brand-gold/10 space-y-2 rounded-xl border p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlertIcon className="text-brand-gold size-4" />
            Worth fixing
          </p>

          <ul className="space-y-1.5">
            {problems.map((problem) => (
              <li key={problem.href} className="text-sm">
                {problem.text}{" "}
                <Link href={problem.href} className="text-primary hover:underline">
                  Take a look
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canResolve ? (
          <TaskCard
            href="/admin/results/pending"
            title="Enter results"
            icon={GavelIcon}
            waiting={tasks.resultsWaiting}
            waitingLabel="Betting has closed on these and nobody has been paid yet. This is the one that holds up money."
            description="Nothing is waiting for a result."
          />
        ) : null}

        {canSupport ? (
          <TaskCard
            href="/admin/support"
            title="Player messages"
            icon={LifeBuoyIcon}
            waiting={tasks.openTickets}
            waitingLabel="Players are waiting to hear back."
            description="Every message has been answered."
          />
        ) : null}

        {canSeeEvents ? (
          <TaskCard
            href="/admin/matches"
            title="Starting soon"
            icon={SwordsIcon}
            waiting={tasks.startingSoon}
            waitingLabel="Events kicking off in the next 24 hours. Check they're set up right."
            description="Nothing starts in the next 24 hours."
          />
        ) : null}

        {canBuild ? (
          <TaskCard
            href="/admin/create"
            title="Set up an event"
            icon={SparklesIcon}
            primary
            description="Game, competitors, name, time, betting questions — all on one page."
          />
        ) : actorCan(actor, "teams.manage") ? (
          <TaskCard
            href="/admin/teams"
            title="Competitors"
            icon={UsersRoundIcon}
            description="The turtles, lanes and doors players pick between."
          />
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold">Today so far</h2>
          <p className="text-muted-foreground text-xs">
            Counted from midnight UTC (<LocalTime value={since} format="short" /> your time)
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Bets placed"
            value={formatCoins(stats.bets.today)}
            hint={`${formatCoins(stats.bets.pending)} still waiting on a result`}
            href={canSeeBets ? "/admin/bets" : undefined}
          />
          <StatCard
            label="Coins staked"
            value={formatCoins(stats.bets.stakedToday)}
            hint={`${formatCoins(stats.bets.stakedAllTime)} all time`}
          />
          <StatCard
            label="Events on today"
            value={formatCoins(stats.matches.today)}
            hint={`${formatCoins(stats.matches.live)} happening right now`}
            href={canSeeEvents ? "/admin/matches" : undefined}
          />
          <StatCard
            label="Players"
            value={formatCoins(stats.users.total)}
            hint={`${formatCoins(stats.users.newToday)} joined today`}
            href={actorCan(actor, "users.view") ? "/admin/users" : undefined}
          />
        </div>
      </section>

      {canSeeBets ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold">The last few bets</h2>
            <Link href="/admin/bets" className="text-primary text-sm hover:underline">
              See them all
            </Link>
          </div>

          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Player</TableHead>
                  <TableHead>Bet on</TableHead>
                  <TableHead>They picked</TableHead>
                  <TableHead className="text-right">Staked</TableHead>
                  <TableHead>How it went</TableHead>
                  <TableHead className="pr-4 text-right">When</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {recentBets.length === 0 ? (
                  <TableEmptyRow colSpan={6}>Nobody has placed a bet yet.</TableEmptyRow>
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
                          ×{formatRatio(bet.ratio)}
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
      ) : null}
    </div>
  );
}
