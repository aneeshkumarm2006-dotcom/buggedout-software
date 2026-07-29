import "server-only";

import type { Types } from "mongoose";

import { connectDB } from "@/lib/db";
import type { BetStatus } from "@/lib/enums";
import { Bet, Match, Question, SupportTicket, User, type IBet, type IMatch, type IUser } from "@/models";

/**
 * The admin dashboard (Phase 6.2).
 *
 * Every window is measured in UTC. The server's own timezone is whatever the
 * host happens to be set to and the admin's is whatever their laptop says, so
 * "today" has to mean one fixed thing or the numbers move depending on who is
 * looking; the cards say so on their face.
 */
export type DashboardStats = {
  matches: {
    /** Anything still to play or still open: upcoming, live or locked. */
    active: number;
    /** Finished with: resolved or cancelled. */
    inactive: number;
    live: number;
    today: number;
    thisMonth: number;
  };
  users: {
    total: number;
    active: number;
    banned: number;
    newToday: number;
  };
  bets: {
    today: number;
    stakedToday: number;
    pending: number;
    stakedAllTime: number;
  };
  queues: {
    /** Markets that are closed to betting and still waiting on a result. */
    pendingResults: number;
    openTickets: number;
  };
};

export type RecentBetRow = {
  id: string;
  username: string;
  userId: string;
  matchId: string;
  matchTitle: string;
  questionText: string;
  optionName: string;
  ratio: number;
  stake: number;
  status: BetStatus;
  placedAt: string;
};

export type AdminDashboard = {
  stats: DashboardStats;
  recentBets: RecentBetRow[];
  /** Midnight UTC the "today" figures are counted from, for the card footnote. */
  since: string;
};

const RECENT_BETS = 10;

export async function getAdminDashboard(): Promise<AdminDashboard> {
  await connectDB();

  const now = new Date();
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const [
    activeMatches,
    inactiveMatches,
    liveMatches,
    matchesToday,
    matchesThisMonth,
    totalUsers,
    bannedUsers,
    newUsersToday,
    betsToday,
    pendingBets,
    stakeToday,
    stakeAllTime,
    pendingResults,
    openTickets,
    recentBets,
  ] = await Promise.all([
    Match.countDocuments({ status: { $in: ["upcoming", "live", "locked"] } }),
    Match.countDocuments({ status: { $in: ["resolved", "cancelled"] } }),
    Match.countDocuments({ status: "live" }),
    Match.countDocuments({ startTime: { $gte: startOfDay, $lt: endOfDay } }),
    Match.countDocuments({ startTime: { $gte: startOfMonth, $lt: startOfNextMonth } }),
    User.countDocuments({}),
    User.countDocuments({ status: "banned" }),
    User.countDocuments({ createdAt: { $gte: startOfDay } }),
    Bet.countDocuments({ createdAt: { $gte: startOfDay } }),
    Bet.countDocuments({ status: "pending" }),
    sumStake({ createdAt: { $gte: startOfDay } }),
    sumStake({}),
    // "Waiting on a result" is the same queue Pending Results shows (6.9).
    Question.countDocuments({ status: "locked" }),
    SupportTicket.countDocuments({ status: { $ne: "closed" } }),
    Bet.find({}).sort({ createdAt: -1 }).limit(RECENT_BETS).lean<IBet[]>(),
  ]);

  return {
    since: startOfDay.toISOString(),
    stats: {
      matches: {
        active: activeMatches,
        inactive: inactiveMatches,
        live: liveMatches,
        today: matchesToday,
        thisMonth: matchesThisMonth,
      },
      users: {
        total: totalUsers,
        active: totalUsers - bannedUsers,
        banned: bannedUsers,
        newToday: newUsersToday,
      },
      bets: {
        today: betsToday,
        stakedToday: stakeToday,
        pending: pendingBets,
        stakedAllTime: stakeAllTime,
      },
      queues: { pendingResults, openTickets },
    },
    recentBets: await decorateRecentBets(recentBets),
  };
}

async function sumStake(match: Record<string, unknown>): Promise<number> {
  const [row] = await Bet.aggregate<{ _id: null; total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$stake" } } },
  ]);

  return row?.total ?? 0;
}

/** Two lookups for the whole feed rather than two per row. */
async function decorateRecentBets(bets: IBet[]): Promise<RecentBetRow[]> {
  if (bets.length === 0) return [];

  const unique = (ids: Types.ObjectId[]) => [...new Map(ids.map((id) => [id.toString(), id])).values()];

  const [users, matches, questions] = await Promise.all([
    User.find({ _id: { $in: unique(bets.map((bet) => bet.userId)) } })
      .select("username")
      .lean<Pick<IUser, "_id" | "username">[]>(),
    Match.find({ _id: { $in: unique(bets.map((bet) => bet.matchId)) } })
      .select("title")
      .lean<Pick<IMatch, "_id" | "title">[]>(),
    Question.find({ _id: { $in: unique(bets.map((bet) => bet.questionId)) } })
      .select("text")
      .lean<{ _id: Types.ObjectId; text: string }[]>(),
  ]);

  const usernameById = new Map(users.map((user) => [user._id.toString(), user.username]));
  const matchTitleById = new Map(matches.map((match) => [match._id.toString(), match.title]));
  const questionTextById = new Map(questions.map((question) => [question._id.toString(), question.text]));

  return bets.map((bet) => ({
    id: bet._id.toString(),
    userId: bet.userId.toString(),
    username: usernameById.get(bet.userId.toString()) ?? "Deleted account",
    matchId: bet.matchId.toString(),
    matchTitle: matchTitleById.get(bet.matchId.toString()) ?? "Match removed",
    questionText: questionTextById.get(bet.questionId.toString()) ?? "Market removed",
    optionName: bet.optionName,
    ratio: bet.ratio,
    stake: bet.stake,
    status: bet.status,
    placedAt: bet.createdAt.toISOString(),
  }));
}
