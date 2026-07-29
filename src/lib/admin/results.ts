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
import { lockExpiredQuestions } from "@/lib/betting";
import { connectDB } from "@/lib/db";
import {
  Bet,
  GameCategory,
  Match,
  Question,
  User,
  type IGameCategory,
  type IMatch,
  type IQuestion,
  type IUser,
} from "@/models";

/**
 * The two results screens (Phase 6.9, 6.10).
 *
 * Pending is the work queue: markets whose betting has closed and which have no
 * result yet. Closed is the record: what was decided, what it paid, who decided
 * it and when.
 *
 * The pending query sweeps expired markets to `locked` before it reads — the
 * cron route (4.3) does the same on a schedule, but an admin refreshing this
 * page should never see a market sitting "open" ten minutes after its end time.
 */
export type PendingResultRow = {
  id: string;
  text: string;
  endDate: string;
  matchId: string;
  matchTitle: string;
  categoryTitle: string;
  options: { id: string; name: string; ratio: number; status: string }[];
  pendingBets: number;
  totalStake: number;
  uniqueBettors: number;
};

export type PendingResultsParams = {
  page?: number;
  q?: string;
  categoryId?: string;
};

export async function listPendingResults(
  params: PendingResultsParams = {},
): Promise<Paged<PendingResultRow>> {
  await connectDB();
  await lockExpiredQuestions();

  const { skip, limit } = pageSlice(params.page ?? 1);

  const filter: QueryFilter<IQuestion> = { status: "locked" };
  if (params.q) filter.text = searchRegex(params.q);

  // Category isn't on the Question, so it has to be resolved through the match.
  if (params.categoryId && isValidObjectId(params.categoryId)) {
    const matchIds = await Match.find({ categoryId: toObjectId(params.categoryId) })
      .select("_id")
      .lean<{ _id: Types.ObjectId }[]>();

    filter.matchId = { $in: matchIds.map((match) => match._id) };
  }

  const [total, questions] = await Promise.all([
    Question.countDocuments(filter),
    // Oldest first: the market that closed longest ago is the one keeping
    // someone waiting for their money.
    Question.find(filter).sort({ endDate: 1 }).skip(skip).limit(limit).lean<IQuestion[]>(),
  ]);

  const matchIds = questions.map((question) => question.matchId);

  const [matches, stakes] = await Promise.all([
    Match.find({ _id: { $in: matchIds } })
      .select("title categoryId")
      .lean<Pick<IMatch, "_id" | "title" | "categoryId">[]>(),
    Bet.aggregate<{
      _id: Types.ObjectId;
      bets: number;
      stake: number;
      bettors: Types.ObjectId[];
    }>([
      {
        $match: {
          questionId: { $in: questions.map((question) => question._id) },
          status: "pending",
        },
      },
      {
        $group: {
          _id: "$questionId",
          bets: { $sum: 1 },
          stake: { $sum: "$stake" },
          bettors: { $addToSet: "$userId" },
        },
      },
    ]),
  ]);

  const matchById = new Map(matches.map((match) => [match._id.toString(), match]));
  const categories = await GameCategory.find({
    _id: { $in: matches.map((match) => match.categoryId) },
  })
    .select("title")
    .lean<Pick<IGameCategory, "_id" | "title">[]>();

  const categoryTitleById = new Map(categories.map((c) => [c._id.toString(), c.title]));
  const stakeByQuestion = new Map(stakes.map((row) => [row._id.toString(), row]));

  return {
    rows: questions.map((question) => {
      const match = matchById.get(question.matchId.toString());
      const stats = stakeByQuestion.get(question._id.toString());

      return {
        id: question._id.toString(),
        text: question.text,
        endDate: question.endDate.toISOString(),
        matchId: question.matchId.toString(),
        matchTitle: match?.title ?? "Match removed",
        categoryTitle: match ? (categoryTitleById.get(match.categoryId.toString()) ?? "—") : "—",
        options: question.options.map((option) => ({
          id: option._id.toString(),
          name: option.name,
          ratio: option.ratio,
          status: option.status,
        })),
        pendingBets: stats?.bets ?? 0,
        totalStake: stats?.stake ?? 0,
        uniqueBettors: stats?.bettors.length ?? 0,
      };
    }),
    page: params.page ?? 1,
    total,
    totalPages: totalPages(total, ADMIN_PAGE_SIZE),
  };
}

export type ClosedResultRow = {
  id: string;
  text: string;
  status: "resolved" | "void";
  resolvedAt: string | null;
  resolvedBy: string | null;
  matchId: string;
  matchTitle: string;
  categoryTitle: string;
  winners: string[];
  betsSettled: number;
  totalStake: number;
  totalPayout: number;
};

export type ClosedResultsParams = {
  page?: number;
  q?: string;
  categoryId?: string;
  status?: "resolved" | "void";
};

export async function listClosedResults(
  params: ClosedResultsParams = {},
): Promise<Paged<ClosedResultRow>> {
  await connectDB();

  const { skip, limit } = pageSlice(params.page ?? 1);

  const filter: QueryFilter<IQuestion> = {
    status: params.status ?? { $in: ["resolved", "void"] },
  };
  if (params.q) filter.text = searchRegex(params.q);

  if (params.categoryId && isValidObjectId(params.categoryId)) {
    const matchIds = await Match.find({ categoryId: toObjectId(params.categoryId) })
      .select("_id")
      .lean<{ _id: Types.ObjectId }[]>();

    filter.matchId = { $in: matchIds.map((match) => match._id) };
  }

  const [total, questions] = await Promise.all([
    Question.countDocuments(filter),
    Question.find(filter)
      .sort({ resolvedAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<IQuestion[]>(),
  ]);

  const [matches, resolvers, payouts] = await Promise.all([
    Match.find({ _id: { $in: questions.map((question) => question.matchId) } })
      .select("title categoryId")
      .lean<Pick<IMatch, "_id" | "title" | "categoryId">[]>(),
    User.find({
      _id: {
        $in: questions.flatMap((question) => (question.resolvedBy ? [question.resolvedBy] : [])),
      },
    })
      .select("username")
      .lean<Pick<IUser, "_id" | "username">[]>(),
    Bet.aggregate<{ _id: Types.ObjectId; bets: number; stake: number; payout: number }>([
      {
        $match: {
          questionId: { $in: questions.map((question) => question._id) },
          status: { $ne: "pending" },
        },
      },
      {
        $group: {
          _id: "$questionId",
          bets: { $sum: 1 },
          stake: { $sum: "$stake" },
          payout: { $sum: "$payout" },
        },
      },
    ]),
  ]);

  const matchById = new Map(matches.map((match) => [match._id.toString(), match]));
  const resolverById = new Map(resolvers.map((user) => [user._id.toString(), user.username]));
  const payoutByQuestion = new Map(payouts.map((row) => [row._id.toString(), row]));

  const categories = await GameCategory.find({
    _id: { $in: matches.map((match) => match.categoryId) },
  })
    .select("title")
    .lean<Pick<IGameCategory, "_id" | "title">[]>();

  const categoryTitleById = new Map(categories.map((c) => [c._id.toString(), c.title]));

  return {
    rows: questions.map((question) => {
      const match = matchById.get(question.matchId.toString());
      const settled = payoutByQuestion.get(question._id.toString());

      return {
        id: question._id.toString(),
        text: question.text,
        // The filter already narrows to these two.
        status: question.status as "resolved" | "void",
        resolvedAt: question.resolvedAt?.toISOString() ?? null,
        resolvedBy: question.resolvedBy
          ? (resolverById.get(question.resolvedBy.toString()) ?? "Deleted account")
          : null,
        matchId: question.matchId.toString(),
        matchTitle: match?.title ?? "Match removed",
        categoryTitle: match ? (categoryTitleById.get(match.categoryId.toString()) ?? "—") : "—",
        winners: question.options.filter((option) => option.isWinner).map((option) => option.name),
        betsSettled: settled?.bets ?? 0,
        totalStake: settled?.stake ?? 0,
        totalPayout: settled?.payout ?? 0,
      };
    }),
    page: params.page ?? 1,
    total,
    totalPages: totalPages(total, ADMIN_PAGE_SIZE),
  };
}
