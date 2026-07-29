import "server-only";

import type { Types } from "mongoose";

import { connectDB } from "@/lib/db";
import { GameCategory, Match, type IGameCategory } from "@/models";

/**
 * The lobby's read model (Phase 5.2): the ten game cards plus how much is
 * actually happening behind each one.
 *
 * "Live" and "upcoming" are read literally off `Match.status` — the admin moves
 * a match to `live`, nothing infers it from the clock. A match whose start time
 * has passed but which nobody has started yet is still upcoming, and saying
 * otherwise on the card would promise markets that aren't open.
 */
export type LobbyTab = "live" | "upcoming";

export const LOBBY_TABS: readonly LobbyTab[] = ["live", "upcoming"];

export function parseLobbyTab(value: string | undefined): LobbyTab {
  return value === "upcoming" ? "upcoming" : "live";
}

export type GameCard = {
  id: string;
  title: string;
  slug: string;
  cardImage: string;
  animatedCard: string | null;
  liveMatches: number;
  upcomingMatches: number;
  /** ISO 8601 start of the soonest upcoming match, for the card's countdown. */
  nextStartTime: string | null;
};

export type Lobby = {
  cards: GameCard[];
  liveMatches: number;
  upcomingMatches: number;
};

/**
 * Every active category, with its live/upcoming counts.
 *
 * All ten cards are returned whichever tab is showing — the tab reorders and
 * re-labels them rather than filtering them away. A lobby that hides seven
 * games because nothing is running on them right now is a lobby that looks
 * broken on a quiet afternoon.
 */
export async function getLobby(tab: LobbyTab): Promise<Lobby> {
  await connectDB();

  const categories = await GameCategory.find({ status: "active" })
    .select("title slug cardImage animatedCard sortOrder")
    .sort({ sortOrder: 1, title: 1 })
    .lean<Pick<IGameCategory, "_id" | "title" | "slug" | "cardImage" | "animatedCard">[]>();

  if (categories.length === 0) {
    return { cards: [], liveMatches: 0, upcomingMatches: 0 };
  }

  const counts = await Match.aggregate<{
    _id: { categoryId: Types.ObjectId; status: string };
    count: number;
    nextStartTime: Date | null;
  }>([
    {
      $match: {
        categoryId: { $in: categories.map((category) => category._id) },
        status: { $in: ["live", "upcoming"] },
      },
    },
    {
      $group: {
        _id: { categoryId: "$categoryId", status: "$status" },
        count: { $sum: 1 },
        nextStartTime: { $min: "$startTime" },
      },
    },
  ]);

  const byCategory = new Map<string, { live: number; upcoming: number; next: Date | null }>();

  for (const row of counts) {
    const key = row._id.categoryId.toString();
    const entry = byCategory.get(key) ?? { live: 0, upcoming: 0, next: null };

    if (row._id.status === "live") entry.live = row.count;
    else entry.upcoming = row.count;

    if (row.nextStartTime && (!entry.next || row.nextStartTime < entry.next)) {
      entry.next = row.nextStartTime;
    }

    byCategory.set(key, entry);
  }

  const cards: GameCard[] = categories.map((category) => {
    const tally = byCategory.get(category._id.toString());

    return {
      id: category._id.toString(),
      title: category.title,
      slug: category.slug,
      cardImage: category.cardImage,
      animatedCard: category.animatedCard,
      liveMatches: tally?.live ?? 0,
      upcomingMatches: tally?.upcoming ?? 0,
      nextStartTime: tally?.next?.toISOString() ?? null,
    };
  });

  // The tab's own count leads; the admin's `sortOrder` breaks every tie, which
  // is what keeps the grid stable as matches come and go.
  const relevant = (card: GameCard) => (tab === "live" ? card.liveMatches : card.upcomingMatches);
  const sorted = cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => relevant(b.card) - relevant(a.card) || a.index - b.index)
    .map((entry) => entry.card);

  return {
    cards: sorted,
    liveMatches: cards.reduce((sum, card) => sum + card.liveMatches, 0),
    upcomingMatches: cards.reduce((sum, card) => sum + card.upcomingMatches, 0),
  };
}
