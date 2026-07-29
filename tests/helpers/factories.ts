import { Types } from "mongoose";

import type { Actor } from "@/lib/authz";
import type { MatchStatus, QuestionStatus } from "@/lib/enums";
import { applyWalletMovement } from "@/lib/wallet";
import {
  Bet,
  GameCategory,
  Match,
  Question,
  Team,
  Tournament,
  User,
  generateReferralCode,
  type IBet,
  type IGameCategory,
  type IMatch,
  type IQuestion,
  type IUser,
} from "@/models";

/**
 * Fixtures for the Phase 9 suites.
 *
 * Everything writes through the real models, so schema validation, indexes and
 * the append-only hooks are all in play — a fixture that the app itself could
 * not have produced would make the tests worthless.
 *
 * The one deliberate exception is `bet()`, which inserts a Bet row directly:
 * the settlement suite needs to place a bet on a market that is *already*
 * locked or has odds it wants to control, which `placeBets` correctly refuses
 * to do. The integration test (9.3) goes through the real placement path.
 */

let sequence = 0;
const unique = () => `${Date.now().toString(36)}${(sequence += 1).toString(36)}`;

/** Hashing at cost 12 costs ~250ms; the fixtures never verify a password. */
const UNUSABLE_HASH = "$2b$12$klKojGQ.z8/wg3eRN7uc0.jtn5VZsImCVpkPjKwmL7JQbq1/LDmle";

export async function user(
  overrides: Partial<Pick<IUser, "email" | "username" | "role" | "status" | "referredBy">> & {
    /** Credited through the wallet service, so the ledger matches from the start. */
    balance?: number;
  } = {},
): Promise<IUser> {
  const tag = unique();

  const [created] = await User.create([
    {
      email: overrides.email ?? `user-${tag}@example.test`,
      username: overrides.username ?? `user_${tag}`.slice(0, 20),
      passwordHash: UNUSABLE_HASH,
      role: overrides.role ?? "user",
      status: overrides.status ?? "active",
      referredBy: overrides.referredBy ?? null,
      referralCode: generateReferralCode(),
    },
  ]);

  if (overrides.balance) {
    await applyWalletMovement({
      userId: created._id,
      type: "admin_credit",
      amount: overrides.balance,
      note: "Test opening balance",
    });
  }

  return (await User.findById(created._id).lean<IUser>())!;
}

export async function category(title = "Lane Races"): Promise<IGameCategory> {
  const [created] = await GameCategory.create([
    {
      title,
      slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${unique()}`,
      cardImage: "/game-cards/lane-races.webp",
      animatedCard: null,
      status: "active",
      sortOrder: 0,
      marketTemplates: [],
    },
  ]);

  return created.toObject() as IGameCategory;
}

export async function match(
  categoryId: Types.ObjectId,
  overrides: { status?: MatchStatus; startTime?: Date; teamIds?: Types.ObjectId[] } = {},
): Promise<IMatch> {
  const teamIds = overrides.teamIds ?? (await teams(categoryId, 2));

  const [created] = await Match.create([
    {
      title: `Match ${unique()}`,
      categoryId,
      tournamentId: null,
      teamIds,
      startTime: overrides.startTime ?? new Date(Date.now() + 60 * 60 * 1000),
      status: overrides.status ?? "live",
    },
  ]);

  return created.toObject() as IMatch;
}

export async function teams(
  categoryId: Types.ObjectId,
  count: number,
): Promise<Types.ObjectId[]> {
  const created = await Team.create(
    Array.from({ length: count }, (_, index) => ({
      categoryId,
      name: `Team ${index + 1} ${unique()}`,
      image: "data:image/svg+xml;base64,PHN2Zy8+",
      status: "active" as const,
    })),
  );

  return created.map((team) => team._id);
}

export async function tournament(categoryId: Types.ObjectId) {
  const [created] = await Tournament.create([
    {
      title: `Tournament ${unique()}`,
      categoryId,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "ongoing",
    },
  ]);

  return created.toObject();
}

export type MarketOptions = {
  options?: { name: string; ratio: number; status?: "active" | "inactive" }[];
  status?: QuestionStatus;
  endDate?: Date;
  minStakePerBet?: number;
  maxStakePerBet?: number;
};

export async function question(
  matchId: Types.ObjectId,
  overrides: MarketOptions = {},
): Promise<IQuestion> {
  const [created] = await Question.create([
    {
      matchId,
      text: `Who wins? ${unique()}`,
      options: (
        overrides.options ?? [
          { name: "Alpha", ratio: 2 },
          { name: "Beta", ratio: 3 },
        ]
      ).map((option) => ({
        name: option.name,
        ratio: option.ratio,
        status: option.status ?? "active",
        isWinner: false,
      })),
      status: overrides.status ?? "active",
      endDate: overrides.endDate ?? new Date(Date.now() + 60 * 60 * 1000),
      minStakePerBet: overrides.minStakePerBet ?? 10,
      maxStakePerBet: overrides.maxStakePerBet ?? 10_000,
    },
  ]);

  return created.toObject() as IQuestion;
}

/** A whole bettable market in one call: category → match → question. */
export async function market(overrides: MarketOptions & { matchStatus?: MatchStatus } = {}) {
  const game = await category();
  const fixture = await match(game._id, { status: overrides.matchStatus ?? "live" });
  const market = await question(fixture._id, overrides);

  return { category: game, match: fixture, question: market };
}

/**
 * Inserts a pending Bet directly. See the file comment — settlement fixtures
 * need bets on markets that placement would refuse.
 */
export async function bet(input: {
  userId: Types.ObjectId;
  categoryId: Types.ObjectId;
  matchId: Types.ObjectId;
  question: IQuestion;
  optionIndex: number;
  stake: number;
}): Promise<IBet> {
  const option = input.question.options[input.optionIndex]!;

  const [created] = await Bet.create([
    {
      userId: input.userId,
      categoryId: input.categoryId,
      matchId: input.matchId,
      questionId: input.question._id,
      optionId: option._id,
      optionName: option.name,
      ratio: option.ratio,
      stake: input.stake,
      potentialWin: Math.round(input.stake * option.ratio),
      status: "pending",
      payout: 0,
      settledAt: null,
    },
  ]);

  return created.toObject() as IBet;
}

/** The `Actor` an admin action would have resolved from the database. */
export function actor(id: Types.ObjectId | string, role: Actor["role"] = "superadmin"): Actor {
  return { id: id.toString(), role, permissions: [] };
}

/** Reads a balance straight off the user document. */
export async function balanceOf(userId: Types.ObjectId | string): Promise<number> {
  const found = await User.findById(userId).select("coinBalance").lean<Pick<IUser, "coinBalance">>();
  return found?.coinBalance ?? 0;
}

/**
 * The ledger invariant every wallet movement is supposed to preserve:
 * `sum(Transaction.amount) === User.coinBalance`.
 */
export async function ledgerTotal(userId: Types.ObjectId | string): Promise<number> {
  const { Transaction } = await import("@/models");

  const [row] = await Transaction.aggregate<{ total: number }>([
    { $match: { userId: new Types.ObjectId(userId.toString()) } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return row?.total ?? 0;
}
