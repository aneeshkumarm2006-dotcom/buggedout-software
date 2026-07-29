import "server-only";

import { Types, type QueryFilter } from "mongoose";

import { connectDB } from "@/lib/db";
import type { BetStatus, QuestionStatus } from "@/lib/enums";
import {
  Bet,
  GameCategory,
  Match,
  Question,
  type IBet,
  type IGameCategory,
  type IMatch,
  type IQuestion,
} from "@/models";

/**
 * My Bets (Phase 5.6). Two tabs: what is still running, and what has a result.
 *
 * Every number on a row comes off the Bet itself — `optionName`, `ratio` and
 * `potentialWin` are the snapshots taken at placement (4.1), so a row keeps
 * showing the price the user was actually given even after an admin has edited
 * the market's odds.
 */
export type BetTab = "open" | "settled";

export const BET_TABS: readonly BetTab[] = ["open", "settled"];

export function parseBetTab(value: string | undefined): BetTab {
  return value === "settled" ? "settled" : "open";
}

/** `pending` is the only unsettled state; everything else has an outcome. */
const SETTLED_STATUSES: BetStatus[] = ["won", "lost", "void", "refunded"];

export type BetHistoryRow = {
  id: string;
  status: BetStatus;
  optionName: string;
  ratio: number;
  stake: number;
  potentialWin: number;
  payout: number;
  placedAt: string;
  settledAt: string | null;
  questionText: string;
  questionStatus: QuestionStatus | null;
  matchId: string;
  matchTitle: string;
  categoryTitle: string | null;
};

export type BetHistoryPage = {
  rows: BetHistoryRow[];
  page: number;
  totalPages: number;
  total: number;
  counts: Record<BetTab, number>;
};

export const BETS_PER_PAGE = 20;

export async function getUserBets(
  userId: string | Types.ObjectId,
  options: { tab: BetTab; page?: number; limit?: number } = { tab: "open" },
): Promise<BetHistoryPage> {
  await connectDB();

  const id = toObjectId(userId);
  const limit = options.limit ?? BETS_PER_PAGE;
  const page = Math.max(1, options.page ?? 1);

  const filter: QueryFilter<IBet> = {
    userId: id,
    status: options.tab === "open" ? "pending" : { $in: SETTLED_STATUSES },
  };

  const [byStatus, total, bets] = await Promise.all([
    Bet.aggregate<{ _id: BetStatus; count: number }>([
      { $match: { userId: id } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Bet.countDocuments(filter),
    Bet.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<IBet[]>(),
  ]);

  const tally = new Map(byStatus.map((row) => [row._id, row.count]));

  return {
    rows: await decorateBets(bets),
    page,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    counts: {
      open: tally.get("pending") ?? 0,
      settled: SETTLED_STATUSES.reduce((sum, status) => sum + (tally.get(status) ?? 0), 0),
    },
  };
}

/** One line of the 7.5 celebration: what paid, and how much. */
export type RecentWin = {
  id: string;
  optionName: string;
  payout: number;
  matchId: string;
  matchTitle: string;
  settledAt: string;
};

/** How far back a win still counts as news worth celebrating. */
const CELEBRATION_WINDOW_HOURS = 72;

/**
 * Wins settled recently enough to still be worth a fanfare (Phase 7.5).
 *
 * Deliberately separate from `getUserBets`: the celebration has to fire on
 * whichever tab the user lands on, and the Open tab's page of rows contains no
 * wins by definition. Which of these the *browser* has already celebrated is
 * the browser's business — this only says what is recent, and nothing here is
 * written back, so no schema had to grow a `celebratedAt`.
 */
export async function getRecentWins(
  userId: string | Types.ObjectId,
  options: { withinHours?: number; limit?: number } = {},
): Promise<RecentWin[]> {
  await connectDB();

  const since = new Date(Date.now() - (options.withinHours ?? CELEBRATION_WINDOW_HOURS) * 3_600_000);

  const wins = await Bet.find({
    userId: toObjectId(userId),
    status: "won",
    settledAt: { $gte: since },
  })
    .sort({ settledAt: -1 })
    .limit(options.limit ?? 10)
    .select("optionName payout matchId settledAt")
    .lean<Pick<IBet, "_id" | "optionName" | "payout" | "matchId" | "settledAt">[]>();

  if (wins.length === 0) return [];

  const matches = await Match.find({
    _id: { $in: [...new Set(wins.map((win) => win.matchId.toString()))].map(toObjectId) },
  })
    .select("title")
    .lean<Pick<IMatch, "_id" | "title">[]>();

  const titleById = new Map(matches.map((match) => [match._id.toString(), match.title]));

  return wins.map((win) => ({
    id: win._id.toString(),
    optionName: win.optionName,
    payout: win.payout,
    matchId: win.matchId.toString(),
    matchTitle: titleById.get(win.matchId.toString()) ?? "Match removed",
    // Every bet in this filter has one; the fallback is for the type, not for a
    // case that can happen.
    settledAt: (win.settledAt ?? new Date()).toISOString(),
  }));
}

/**
 * Fills in the context a bet row needs — which market, which match, which game.
 * Three queries for the whole page rather than three per row.
 */
async function decorateBets(bets: IBet[]): Promise<BetHistoryRow[]> {
  if (bets.length === 0) return [];

  const unique = <T>(values: T[]) => [...new Set(values)];

  const [questions, matches, categories] = await Promise.all([
    Question.find({ _id: { $in: unique(bets.map((bet) => bet.questionId.toString())).map(toObjectId) } })
      .select("text status")
      .lean<Pick<IQuestion, "_id" | "text" | "status">[]>(),
    Match.find({ _id: { $in: unique(bets.map((bet) => bet.matchId.toString())).map(toObjectId) } })
      .select("title")
      .lean<Pick<IMatch, "_id" | "title">[]>(),
    GameCategory.find({
      _id: { $in: unique(bets.map((bet) => bet.categoryId.toString())).map(toObjectId) },
    })
      .select("title")
      .lean<Pick<IGameCategory, "_id" | "title">[]>(),
  ]);

  const questionById = new Map(questions.map((question) => [question._id.toString(), question]));
  const matchById = new Map(matches.map((match) => [match._id.toString(), match]));
  const categoryById = new Map(categories.map((category) => [category._id.toString(), category]));

  return bets.map((bet) => {
    const question = questionById.get(bet.questionId.toString());
    const match = matchById.get(bet.matchId.toString());

    return {
      id: bet._id.toString(),
      status: bet.status,
      optionName: bet.optionName,
      ratio: bet.ratio,
      stake: bet.stake,
      potentialWin: bet.potentialWin,
      payout: bet.payout,
      placedAt: bet.createdAt.toISOString(),
      settledAt: bet.settledAt?.toISOString() ?? null,
      // A market deleted out from under a settled bet is possible; the bet is
      // still a real thing that happened, so it renders without the context.
      questionText: question?.text ?? "Market removed",
      questionStatus: question?.status ?? null,
      matchId: bet.matchId.toString(),
      matchTitle: match?.title ?? "Match removed",
      categoryTitle: categoryById.get(bet.categoryId.toString())?.title ?? null,
    };
  });
}

function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return typeof value === "string" ? new Types.ObjectId(value) : value;
}
