import "server-only";

import { Types, type QueryFilter } from "mongoose";

import {
  ADMIN_PAGE_SIZE,
  pageSlice,
  searchRegex,
  totalPages,
  type Paged,
} from "@/lib/admin/list-params";
import { isValidObjectId, toObjectId } from "@/lib/admin/shared";
import { connectDB } from "@/lib/db";
import type { BetStatus, TransactionType } from "@/lib/enums";
import {
  Bet,
  GameCategory,
  Match,
  Question,
  Transaction,
  User,
  type IBet,
  type IGameCategory,
  type IMatch,
  type IQuestion,
  type ITransaction,
  type IUser,
} from "@/models";

/**
 * The two global money screens (Phase 6.12): every transaction, and every bet.
 *
 * Both are read-only by construction — the Transaction model rejects updates
 * and deletes outright, and a Bet only ever moves through settlement. Search is
 * by username, which means resolving names to ids first: the rows themselves
 * only carry a `userId`, and a `$lookup` per page would cost more than one
 * extra query.
 */

/** Usernames/emails matching the term → their ids. `null` = don't filter by user. */
async function resolveUserFilter(term: string | undefined): Promise<Types.ObjectId[] | null> {
  if (!term) return null;

  const regex = searchRegex(term);

  const users = await User.find({ $or: [{ username: regex }, { email: regex }] })
    .select("_id")
    // A search that matches half the userbase isn't a search; the cap keeps the
    // `$in` sane and the operator can narrow their term.
    .limit(200)
    .lean<{ _id: Types.ObjectId }[]>();

  return users.map((user) => user._id);
}

/* ------------------------------------------------------------------ *
 * Global ledger
 * ------------------------------------------------------------------ */

export type LedgerRow = {
  id: string;
  userId: string;
  username: string;
  type: TransactionType;
  /** Signed: credits positive, debits negative. */
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
};

export type LedgerParams = {
  page?: number;
  q?: string;
  type?: TransactionType;
  userId?: string;
  from?: Date;
  to?: Date;
};

export type LedgerTotals = { credits: number; debits: number; net: number };

export async function listTransactions(
  params: LedgerParams = {},
): Promise<Paged<LedgerRow> & { totals: LedgerTotals }> {
  await connectDB();

  const { skip, limit } = pageSlice(params.page ?? 1);
  const filter: QueryFilter<ITransaction> = {};

  if (params.type) filter.type = params.type;

  if (params.userId && isValidObjectId(params.userId)) {
    filter.userId = toObjectId(params.userId);
  } else {
    const userIds = await resolveUserFilter(params.q);
    if (userIds) filter.userId = { $in: userIds };
  }

  const createdAt = dateRange(params.from, params.to);
  if (createdAt) filter.createdAt = createdAt;

  const [total, rows, totals] = await Promise.all([
    Transaction.countDocuments(filter),
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<ITransaction[]>(),
    Transaction.aggregate<{ _id: null; credits: number; debits: number }>([
      { $match: filter },
      {
        $group: {
          _id: null,
          credits: { $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] } },
          debits: { $sum: { $cond: [{ $lt: ["$amount", 0] }, "$amount", 0] } },
        },
      },
    ]),
  ]);

  const users = await User.find({ _id: { $in: rows.map((row) => row.userId) } })
    .select("username")
    .lean<Pick<IUser, "_id" | "username">[]>();

  const usernameById = new Map(users.map((user) => [user._id.toString(), user.username]));
  const summary = totals[0];

  return {
    rows: rows.map((row) => ({
      id: row._id.toString(),
      userId: row.userId.toString(),
      username: usernameById.get(row.userId.toString()) ?? "Deleted account",
      type: row.type,
      amount: row.amount,
      balanceAfter: row.balanceAfter,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    })),
    page: params.page ?? 1,
    total,
    totalPages: totalPages(total, ADMIN_PAGE_SIZE),
    totals: {
      credits: summary?.credits ?? 0,
      // Stored negative; shown as a magnitude.
      debits: Math.abs(summary?.debits ?? 0),
      net: (summary?.credits ?? 0) + (summary?.debits ?? 0),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Global bet history
 * ------------------------------------------------------------------ */

export type AdminBetRow = {
  id: string;
  userId: string;
  username: string;
  matchId: string;
  matchTitle: string;
  categoryTitle: string;
  questionText: string;
  optionName: string;
  ratio: number;
  stake: number;
  potentialWin: number;
  payout: number;
  status: BetStatus;
  placedAt: string;
  settledAt: string | null;
};

export type BetListParams = {
  page?: number;
  q?: string;
  status?: BetStatus;
  categoryId?: string;
  matchId?: string;
  userId?: string;
};

export type BetTotals = { staked: number; returned: number };

export async function listBets(
  params: BetListParams = {},
): Promise<Paged<AdminBetRow> & { totals: BetTotals }> {
  await connectDB();

  const { skip, limit } = pageSlice(params.page ?? 1);
  const filter: QueryFilter<IBet> = {};

  if (params.status) filter.status = params.status;
  if (params.categoryId && isValidObjectId(params.categoryId)) {
    filter.categoryId = toObjectId(params.categoryId);
  }
  if (params.matchId && isValidObjectId(params.matchId)) {
    filter.matchId = toObjectId(params.matchId);
  }

  if (params.userId && isValidObjectId(params.userId)) {
    filter.userId = toObjectId(params.userId);
  } else {
    const userIds = await resolveUserFilter(params.q);
    if (userIds) filter.userId = { $in: userIds };
  }

  const [total, bets, totals] = await Promise.all([
    Bet.countDocuments(filter),
    Bet.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean<IBet[]>(),
    Bet.aggregate<{ _id: null; staked: number; returned: number }>([
      { $match: filter },
      { $group: { _id: null, staked: { $sum: "$stake" }, returned: { $sum: "$payout" } } },
    ]),
  ]);

  const [users, matches, questions, categories] = await Promise.all([
    User.find({ _id: { $in: bets.map((bet) => bet.userId) } })
      .select("username")
      .lean<Pick<IUser, "_id" | "username">[]>(),
    Match.find({ _id: { $in: bets.map((bet) => bet.matchId) } })
      .select("title")
      .lean<Pick<IMatch, "_id" | "title">[]>(),
    Question.find({ _id: { $in: bets.map((bet) => bet.questionId) } })
      .select("text")
      .lean<Pick<IQuestion, "_id" | "text">[]>(),
    GameCategory.find({ _id: { $in: bets.map((bet) => bet.categoryId) } })
      .select("title")
      .lean<Pick<IGameCategory, "_id" | "title">[]>(),
  ]);

  const usernameById = new Map(users.map((user) => [user._id.toString(), user.username]));
  const matchTitleById = new Map(matches.map((match) => [match._id.toString(), match.title]));
  const questionTextById = new Map(questions.map((q) => [q._id.toString(), q.text]));
  const categoryTitleById = new Map(categories.map((c) => [c._id.toString(), c.title]));

  const summary = totals[0];

  return {
    rows: bets.map((bet) => ({
      id: bet._id.toString(),
      userId: bet.userId.toString(),
      username: usernameById.get(bet.userId.toString()) ?? "Deleted account",
      matchId: bet.matchId.toString(),
      matchTitle: matchTitleById.get(bet.matchId.toString()) ?? "Match removed",
      categoryTitle: categoryTitleById.get(bet.categoryId.toString()) ?? "—",
      questionText: questionTextById.get(bet.questionId.toString()) ?? "Market removed",
      optionName: bet.optionName,
      ratio: bet.ratio,
      stake: bet.stake,
      potentialWin: bet.potentialWin,
      payout: bet.payout,
      status: bet.status,
      placedAt: bet.createdAt.toISOString(),
      settledAt: bet.settledAt?.toISOString() ?? null,
    })),
    page: params.page ?? 1,
    total,
    totalPages: totalPages(total, ADMIN_PAGE_SIZE),
    totals: { staked: summary?.staked ?? 0, returned: summary?.returned ?? 0 },
  };
}

function dateRange(from?: Date, to?: Date): { $gte?: Date; $lt?: Date } | null {
  if (!from && !to) return null;

  const range: { $gte?: Date; $lt?: Date } = {};
  if (from) range.$gte = from;
  // `?to=2026-07-28` parses to midnight, and the day it names should be
  // included — so the bound is the start of the next day.
  if (to) range.$lt = new Date(to.getTime() + 24 * 60 * 60 * 1000);

  return range;
}
