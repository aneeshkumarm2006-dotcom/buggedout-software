import { EMPTY_ART, EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SegmentedNav } from "@/components/common/segmented-nav";
import { GameCard } from "@/components/game/game-card";
import { getLobby, parseLobbyTab } from "@/lib/lobby";

/**
 * The games lobby (Phase 5.2). `/` is this for a signed-in user; the proxy
 * sends guests to `/login`.
 *
 * The Live/Upcoming choice lives in the query string rather than in client
 * state, so a shared link opens on the same tab and the server only counts what
 * it is about to render. Both tabs list all ten games — the tab reorders and
 * re-labels the tiles instead of hiding seven of them on a quiet afternoon.
 */
export default async function LobbyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: requestedTab } = await searchParams;
  const tab = parseLobbyTab(requestedTab);
  const lobby = await getLobby(tab);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <PageHeader
        title="Games"
        description="Ten live animal events. Pick a game, pick a market, back your hunch."
      />

      <SegmentedNav
        ariaLabel="Match availability"
        active={tab}
        items={[
          { value: "live", label: "Live", href: "/?tab=live", count: lobby.liveMatches },
          {
            value: "upcoming",
            label: "Upcoming",
            href: "/?tab=upcoming",
            count: lobby.upcomingMatches,
          },
        ]}
      />

      {lobby.cards.length === 0 ? (
        <EmptyState
          art={EMPTY_ART.games}
          title="No games yet"
          description="The games are still being set up. Check back in a moment."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4">
          {lobby.cards.map((card, index) => (
            <GameCard key={card.id} card={card} tab={tab} eager={index < 4} />
          ))}
        </div>
      )}
    </div>
  );
}
