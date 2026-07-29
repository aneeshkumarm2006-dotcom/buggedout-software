import "server-only";

import { unstable_cache } from "next/cache";
import { Types, type QueryFilter } from "mongoose";

import { connectDB } from "@/lib/db";
import { Bet, GameCategory, User, type IBet, type IGameCategory, type IUser } from "@/models";

/**
 * The leaderboard (Phase 5.8): rank, name, games played, total bet, max win and
 * net win, filterable by game and by time range.
 *
 * One aggregation over settled bets — `pending` is excluded because a bet with
 * no result yet can't have won or lost anything, and counting its stake against
 * a player would rank them below someone who simply hasn't bet.
 *
 * Cached: the numbers move slowly and this is the one screen everybody opens at
 * once. `LEADERBOARD_TAG` is here so a later phase can bust it from settlement
 * rather than waiting out the window.
 */
export const LEADERBOARD_TAG = "leaderboard";

const LEADERBOARD_REVALIDATE_SECONDS = 60;

export type LeaderboardRange = "day" | "week" | "month" | "all";

export const LEADERBOARD_RANGES: readonly LeaderboardRange[] = ["day", "week", "month", "all"];

export const RANGE_LABELS: Record<LeaderboardRange, string> = {
  day: "24 hours",
  week: "7 days",
  month: "30 days",
  all: "All time",
};

export function parseLeaderboardRange(value: string | undefined): LeaderboardRange {
  return LEADERBOARD_RANGES.includes(value as LeaderboardRange)
    ? (value as LeaderboardRange)
    : "week";
}

const RANGE_MS: Record<Exclude<LeaderboardRange, "all">, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

export type LeaderboardRow = {
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  /** Distinct matches the player has a settled bet on. */
  gamesPlayed: number;
  betsPlaced: number;
  totalBet: number;
  /** Largest single payout — the number people actually brag about. */
  maxWin: number;
  netWin: number;
};

export type LeaderboardFilterOption = { id: string; title: string };

export type Leaderboard = {
  rows: LeaderboardRow[];
  games: LeaderboardFilterOption[];
};

export const LEADERBOARD_SIZE = 50;

export async function getLeaderboard(options: {
  range: LeaderboardRange;
  categoryId?: string | null;
  limit?: number;
}): Promise<Leaderboard> {
  const [rows, games] = await Promise.all([
    getCachedLeaderboardRows(
      options.range,
      options.categoryId ?? null,
      options.limit ?? LEADERBOARD_SIZE,
    ),
    getLeaderboardGames(),
  ]);

  return { rows, games };
}

/**
 * The cache key is the argument list, so each (range, game) pair gets its own
 * entry and a filtered view can't serve the unfiltered one.
 *
 * Buckets the range to the top of the minute before it reaches Mongo: a
 * millisecond-precise `since` would make every request a cache miss.
 */
const getCachedLeaderboardRows = unstable_cache(
  async (
    range: LeaderboardRange,
    categoryId: string | null,
    limit: number,
  ): Promise<LeaderboardRow[]> => {
    await connectDB();

    const match: QueryFilter<IBet> = { status: { $in: ["won", "lost"] } };

    if (range !== "all") {
      const bucket = Math.floor(Date.now() / 60_000) * 60_000;
      match.settledAt = { $gte: new Date(bucket - RANGE_MS[range]) };
    }

    if (categoryId && Types.ObjectId.isValid(categoryId)) {
      match.categoryId = new Types.ObjectId(categoryId);
    }

    const grouped = await Bet.aggregate<{
      _id: Types.ObjectId;
      matches: Types.ObjectId[];
      betsPlaced: number;
      totalBet: number;
      maxWin: number;
      returned: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: "$userId",
          matches: { $addToSet: "$matchId" },
          betsPlaced: { $sum: 1 },
          totalBet: { $sum: "$stake" },
          maxWin: { $max: "$payout" },
          returned: { $sum: "$payout" },
        },
      },
      // Net = what came back minus what went in. Sorted in Mongo so the
      // `$limit` below is a real cut-off rather than a slice of an arbitrary set.
      { $addFields: { netWin: { $subtract: ["$returned", "$totalBet"] } } },
      { $sort: { netWin: -1, maxWin: -1, totalBet: -1 } },
      { $limit: limit },
    ]);

    if (grouped.length === 0) return [];

    const users = await User.find({ _id: { $in: grouped.map((row) => row._id) } })
      .select("username avatar")
      .lean<Pick<IUser, "_id" | "username" | "avatar">[]>();

    const userById = new Map(users.map((user) => [user._id.toString(), user]));

    return grouped
      .map((row) => {
        const user = userById.get(row._id.toString());
        if (!user) return null;

        return {
          rank: 0,
          userId: row._id.toString(),
          username: user.username,
          avatar: user.avatar,
          gamesPlayed: row.matches.length,
          betsPlaced: row.betsPlaced,
          totalBet: row.totalBet,
          maxWin: row.maxWin,
          netWin: row.returned - row.totalBet,
        };
      })
      // A deleted account drops out rather than ranking as "unknown"; ranks are
      // assigned after that so they stay 1..n with no gaps.
      .filter((row) => row !== null)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  },
  ["leaderboard-rows"],
  { revalidate: LEADERBOARD_REVALIDATE_SECONDS, tags: [LEADERBOARD_TAG] },
);

/** The game filter's options — the same active categories the lobby shows. */
const getLeaderboardGames = unstable_cache(
  async (): Promise<LeaderboardFilterOption[]> => {
    await connectDB();

    const categories = await GameCategory.find({ status: "active" })
      .select("title")
      .sort({ sortOrder: 1, title: 1 })
      .lean<Pick<IGameCategory, "_id" | "title">[]>();

    return categories.map((category) => ({
      id: category._id.toString(),
      title: category.title,
    }));
  },
  ["leaderboard-games"],
  { revalidate: 300, tags: [LEADERBOARD_TAG] },
);
