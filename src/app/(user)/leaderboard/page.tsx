import type { Metadata } from "next";
import Link from "next/link";

import { EMPTY_ART, EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { auth } from "@/auth";
import { formatCoins, formatSignedCoins, initials } from "@/lib/format";
import {
  LEADERBOARD_RANGES,
  RANGE_LABELS,
  getLeaderboard,
  parseLeaderboardRange,
  type LeaderboardRange,
} from "@/lib/leaderboard";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leaderboard" };

/**
 * The leaderboard (Phase 5.8), ranked by net win.
 *
 * Both filters are links rather than a `<select>` with an `onChange`: the data
 * is aggregated and cached per (range, game) pair on the server, so the URL is
 * also the cache key, and the page needs no client JavaScript to work.
 */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; game?: string }>;
}) {
  const [session, { range: requestedRange, game }] = await Promise.all([auth(), searchParams]);

  const range = parseLeaderboardRange(requestedRange);
  const { rows, games } = await getLeaderboard({ range, categoryId: game ?? null });

  const activeGame = games.find((option) => option.id === game) ?? null;
  const href = (next: { range?: LeaderboardRange; game?: string | null }) => {
    const params = new URLSearchParams();
    const nextRange = next.range ?? range;
    const nextGame = next.game === undefined ? (activeGame?.id ?? null) : next.game;

    if (nextRange !== "week") params.set("range", nextRange);
    if (nextGame) params.set("game", nextGame);

    const query = params.toString();
    return query ? `/leaderboard?${query}` : "/leaderboard";
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader
        title="Leaderboard"
        description={`Ranked by net win${activeGame ? ` on ${activeGame.title}` : ""} over the last ${RANGE_LABELS[range].toLowerCase()}.`}
      />

      <div className="space-y-2">
        <FilterRow label="Period">
          {LEADERBOARD_RANGES.map((option) => (
            <FilterChip
              key={option}
              href={href({ range: option })}
              active={option === range}
              label={RANGE_LABELS[option]}
            />
          ))}
        </FilterRow>

        {games.length > 0 ? (
          <FilterRow label="Game">
            <FilterChip href={href({ game: null })} active={!activeGame} label="All games" />
            {games.map((option) => (
              <FilterChip
                key={option.id}
                href={href({ game: option.id })}
                active={activeGame?.id === option.id}
                label={option.title}
              />
            ))}
          </FilterRow>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          art={EMPTY_ART.leaderboard}
          title="Nobody on the board yet"
          description="Rankings appear once bets have been settled in this period. Try a longer one."
        />
      ) : (
        <div className="bg-card ring-foreground/10 overflow-x-auto rounded-xl ring-1">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-muted-foreground border-b text-xs">
              <tr>
                <th scope="col" className="w-12 px-3 py-2.5 text-left font-medium">
                  #
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Player
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Games
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Total bet
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Max win
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Net win
                </th>
              </tr>
            </thead>

            <tbody className="divide-border divide-y">
              {rows.map((row) => {
                const isYou = row.userId === session?.user?.id;

                return (
                  <tr key={row.userId} className={cn(isYou && "bg-primary/5")}>
                    <td className="text-muted-foreground px-3 py-2.5 tabular-nums">
                      {row.rank <= 3 ? (
                        <span aria-label={`Rank ${row.rank}`}>
                          {["🥇", "🥈", "🥉"][row.rank - 1]}
                        </span>
                      ) : (
                        row.rank
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <Avatar size="sm">
                          {row.avatar ? <AvatarImage src={row.avatar} alt="" /> : null}
                          <AvatarFallback>{initials(row.username)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate font-medium">{row.username}</span>
                        {isYou ? (
                          <span className="bg-primary/15 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                            YOU
                          </span>
                        ) : null}
                      </span>
                    </td>

                    <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">
                      {row.gamesPlayed}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCoins(row.totalBet)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCoins(row.maxWin)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right font-semibold tabular-nums",
                        row.netWin > 0 ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {formatSignedCoins(row.netWin)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-muted-foreground/80 text-xs">
        Settled bets only — an open bet has no result to rank. &ldquo;Games&rdquo; counts the
        distinct matches a player has bet on. Updates every minute.
      </p>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <span className="text-muted-foreground shrink-0 text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

function FilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      {label}
    </Link>
  );
}
