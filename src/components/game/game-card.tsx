import Link from "next/link";
import { CalendarClockIcon } from "lucide-react";

import { AssetImage } from "@/components/common/asset-image";
import { Countdown } from "@/components/common/countdown";
import { GameCardVideo } from "@/components/game/game-card-video";
import type { GameCard as GameCardData } from "@/lib/lobby";
import type { LobbyTab } from "@/lib/lobby";
import { cn } from "@/lib/utils";

/**
 * One of the ten game tiles on the lobby (Phase 5.2).
 *
 * The footer answers the only question the tile is really being asked — is
 * anything running here right now — using whichever count the active tab is
 * about.
 *
 * The art well is 16:9 because the delivered cards are (8.2): every one of them
 * is a framed composition with its own border, so cropping to a squarer tile
 * would slice the frame off both ends. `animatedCard` layers the matching clip
 * over it on hover (8.3) — two of the ten games have no animation, and the
 * field is null for those.
 */
export function GameCard({
  card,
  tab,
  eager,
}: {
  card: GameCardData;
  tab: LobbyTab;
  /** The first row is above the fold; everything else can wait. */
  eager?: boolean;
}) {
  const count = tab === "live" ? card.liveMatches : card.upcomingMatches;
  const isLive = card.liveMatches > 0;

  return (
    <Link
      href={`/games/${card.slug}`}
      // Ten tiles that each prefetch their route means ten extra server renders
      // and ten flight payloads to parse before the lobby has finished painting
      // its own (9.5). The category page is one tap and one fetch away.
      prefetch={false}
      className="group focus-visible:ring-ring/50 bg-card ring-foreground/10 hover:ring-primary/40 relative flex flex-col overflow-hidden rounded-xl ring-1 transition-[box-shadow,transform] hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:outline-none active:translate-y-px"
    >
      <div className="bg-muted relative aspect-video w-full overflow-hidden">
        <AssetImage
          src={card.cardImage}
          alt=""
          fill
          eager={eager}
          sizes="(min-width: 1280px) 20vw, (min-width: 640px) 33vw, 50vw"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {card.animatedCard ? <GameCardVideo src={card.animatedCard} /> : null}

        {/* Cards are photographic; the scrim is what keeps the title legible
            whatever lands under it. */}
        <span
          aria-hidden
          className="from-card absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t to-transparent"
        />

        {isLive ? (
          <span className="bg-background/85 text-live ring-live/30 absolute top-2 left-2 flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.08em] ring-1 ring-inset backdrop-blur">
            <span className="relative flex size-1.5">
              <span className="bg-live absolute inline-flex size-full animate-ping rounded-full opacity-75" />
              <span className="bg-live relative inline-flex size-1.5 rounded-full" />
            </span>
            LIVE
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-3">
        {/* h2, not h3: the lobby's only other heading is the page `h1`, and a
            jump straight to h3 is a heading-order failure with no h2 to sit
            under. Every tile is a sibling section of the page. */}
        <h2 className="font-heading truncate text-sm font-semibold">{card.title}</h2>

        <p
          className={cn(
            "flex items-center gap-1 text-xs",
            count > 0 ? "text-muted-foreground" : "text-muted-foreground/80",
          )}
        >
          {count > 0 ? (
            <>
              {count} {tab === "live" ? "live" : "upcoming"} match{count === 1 ? "" : "es"}
            </>
          ) : tab === "upcoming" && card.nextStartTime ? (
            <>
              <CalendarClockIcon className="size-3" />
              <Countdown target={card.nextStartTime} prefix="in" endedLabel="Starting" />
            </>
          ) : (
            <>No {tab} matches</>
          )}
        </p>
      </div>
    </Link>
  );
}
