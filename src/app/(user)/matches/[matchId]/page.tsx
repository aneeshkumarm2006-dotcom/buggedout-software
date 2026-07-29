import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TicketIcon, TimerIcon, TrophyIcon } from "lucide-react";

import { Countdown } from "@/components/common/countdown";
import { EmptyState } from "@/components/common/empty-state";
import { LocalTime } from "@/components/common/local-time";
import { PageHeader } from "@/components/common/page-header";
import { MatchStatusBadge } from "@/components/common/status-badge";
import { MarketCard } from "@/components/game/market-card";
import { TeamStrip } from "@/components/game/team-strip";
import { getMatchDetail } from "@/lib/matches";

type MatchPageProps = { params: Promise<{ matchId: string }> };

export async function generateMetadata({ params }: MatchPageProps): Promise<Metadata> {
  const { matchId } = await params;
  const match = await getMatchDetail(matchId);

  return { title: match?.title ?? "Match" };
}

/**
 * The match page (Phase 5.4): teams header, question cards, tappable odds.
 *
 * Deliberately uncached. `getMatchDetail` locks any market whose end time has
 * passed before rendering it (4.3's "check on read"), and a cached copy would
 * quietly re-open one — the odds on this page have to be the ones the engine
 * will actually honour.
 */
export default async function MatchPage({ params }: MatchPageProps) {
  const { matchId } = await params;
  const match = await getMatchDetail(matchId);

  if (!match) notFound();

  const openMarkets = match.markets.filter(
    (market) => market.status === "active" && match.bettable,
  ).length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader
        backHref={`/games/${match.category.slug}`}
        backLabel={match.category.title}
        title={match.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <MatchStatusBadge status={match.status} />
            <span className="flex items-center gap-1">
              <TimerIcon className="size-3.5" />
              <LocalTime value={match.startTime} />
            </span>
            {match.status === "upcoming" ? (
              <>
                <span aria-hidden>·</span>
                <Countdown target={match.startTime} prefix="starts in" endedLabel="Starting soon" />
              </>
            ) : null}
          </span>
        }
      />

      {match.teams.length > 0 ? (
        <section
          aria-label="Line-up"
          className="bg-card ring-foreground/10 rounded-xl px-4 py-3.5 ring-1"
        >
          <div className="flex items-center justify-between gap-2 pb-2.5">
            <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Line-up
            </h2>
            {match.tournament ? (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <TrophyIcon className="size-3.5" />
                {match.tournament.title}
              </span>
            ) : null}
          </div>

          <TeamStrip teams={match.teams} size="lg" className="gap-x-5 gap-y-3" />
        </section>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">Markets</h2>
          {match.markets.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              {openMarkets > 0
                ? `${openMarkets} open for betting`
                : "Betting is closed on this match"}
            </p>
          ) : null}
        </div>

        {match.markets.length === 0 ? (
          <EmptyState
            icon={TicketIcon}
            title="No markets yet"
            description="Questions for this match haven't been published. Check back closer to the start."
          />
        ) : (
          <div className="grid gap-3">
            {match.markets.map((market) => (
              <MarketCard
                key={market.id}
                market={market}
                matchId={match.id}
                matchTitle={match.title}
                matchBettable={match.bettable}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
