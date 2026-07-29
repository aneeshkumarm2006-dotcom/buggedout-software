import Link from "next/link";
import { ChevronRightIcon, TimerIcon } from "lucide-react";

import { Countdown } from "@/components/common/countdown";
import { LocalTime } from "@/components/common/local-time";
import { MatchStatusBadge } from "@/components/common/status-badge";
import { TeamStrip } from "@/components/game/team-strip";
import type { MatchListItem } from "@/lib/matches";

/**
 * One match in a category listing (Phase 5.3): teams, start time, countdown and
 * status.
 *
 * The countdown only runs for a match that hasn't started — once it is live or
 * finished, the absolute time is the useful number and a ticking "0s" is not.
 */
export function MatchCard({ match }: { match: MatchListItem }) {
  return (
    <Link
      href={`/matches/${match.id}`}
      className="group focus-visible:ring-ring/50 bg-card ring-foreground/10 hover:bg-card/80 flex items-center gap-3 rounded-xl px-4 py-3 ring-1 transition-colors focus-visible:ring-3 focus-visible:outline-none"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <MatchStatusBadge status={match.status} />

          {match.openMarkets > 0 ? (
            <span className="text-muted-foreground text-xs">
              {match.openMarkets} open market{match.openMarkets === 1 ? "" : "s"}
            </span>
          ) : match.totalMarkets > 0 ? (
            <span className="text-muted-foreground/80 text-xs">
              {match.totalMarkets} market{match.totalMarkets === 1 ? "" : "s"} · betting closed
            </span>
          ) : (
            <span className="text-muted-foreground/80 text-xs">No markets yet</span>
          )}
        </div>

        <p className="truncate font-medium">{match.title}</p>

        <TeamStrip teams={match.teams} />

        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <TimerIcon className="size-3.5 shrink-0" />
          <LocalTime value={match.startTime} format="short" />
          {match.status === "upcoming" ? (
            <>
              <span aria-hidden>·</span>
              <Countdown target={match.startTime} prefix="in" endedLabel="Starting soon" />
            </>
          ) : null}
        </p>
      </div>

      <ChevronRightIcon className="text-muted-foreground group-hover:text-foreground size-5 shrink-0 transition-colors" />
    </Link>
  );
}
