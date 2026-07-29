import "server-only";

import { Types, type QueryFilter } from "mongoose";

import { potentialWinFor, selectionKey } from "@/lib/bet-math";
import { connectDB } from "@/lib/db";
import type { MatchStatus, QuestionStatus } from "@/lib/enums";
import { WalletError, applyWalletMovement, withWalletTransaction } from "@/lib/wallet";
import { Bet, Match, Question, User, type IMatch, type IQuestion, type IQuestionOption, type IUser } from "@/models";
import type { BetSelectionInput } from "@/schemas/bet";

/**
 * Bet placement and market locking (Phase 4.1–4.3).
 *
 * Everything a bet is worth is SNAPSHOT onto the Bet row at placement —
 * option name and ratio — so an admin editing odds afterwards can never change
 * what an outstanding bet pays. Settlement (`src/lib/settlement.ts`) reads only
 * those snapshots.
 *
 * Nothing the client sends is trusted beyond `questionId`, `optionId` and
 * `stake`: the price, the option name and the category all come off the server's
 * own copy of the market.
 */

/** A match only takes bets before it is locked, resolved or cancelled. */
export const BETTABLE_MATCH_STATUSES: readonly MatchStatus[] = ["upcoming", "live"];

// Re-exported so server callers have one import for the whole engine; the
// definitions live in `bet-math.ts`, which the client bundle can also reach.
export { potentialWinFor, selectionKey };

export type SelectionError = {
  key: string;
  questionId: string;
  optionId: string;
  message: string;
};

export type PlacedBet = {
  betId: string;
  key: string;
  questionId: string;
  questionText: string;
  optionId: string;
  optionName: string;
  ratio: number;
  stake: number;
  potentialWin: number;
};

export type PlaceBetsResult =
  | {
      ok: true;
      placed: PlacedBet[];
      /** Selections that lost their race — the market closed mid-submit. */
      failed: SelectionError[];
      totalStake: number;
      balance: number;
    }
  | { ok: false; message: string; failed: SelectionError[] };

/**
 * Places every selection in the slip as an independent bet (4.1, 4.2).
 *
 * Two passes on purpose. The first validates the whole slip and places nothing,
 * so an unaffordable total or a closed market sends the user back to a slip they
 * can still fix rather than a half-placed one. The second places each selection
 * on its own — they are independent bets, not a parlay, so one losing a race
 * against the lock sweep must not cancel the rest.
 */
export async function placeBets(
  userId: string | Types.ObjectId,
  selections: BetSelectionInput[],
): Promise<PlaceBetsResult> {
  await connectDB();

  const user = await User.findById(toObjectId(userId))
    .select("coinBalance status")
    .lean<Pick<IUser, "_id" | "coinBalance" | "status">>();

  if (!user) return { ok: false, message: "That account no longer exists.", failed: [] };
  if (user.status !== "active") {
    return { ok: false, message: "This account can't place bets right now.", failed: [] };
  }

  const { valid, failed } = await validateSelections(selections);

  // All-or-nothing while the slip is still editable.
  if (failed.length > 0) {
    return {
      ok: false,
      message:
        failed.length === selections.length
          ? failed[0]!.message
          : "Some selections can no longer be placed. Update your slip and try again.",
      failed,
    };
  }

  const totalStake = valid.reduce((sum, selection) => sum + selection.stake, 0);

  if (totalStake > user.coinBalance) {
    return {
      ok: false,
      message: `This slip needs ${totalStake.toLocaleString()} coins and you have ${user.coinBalance.toLocaleString()}.`,
      failed: [],
    };
  }

  const placed: PlacedBet[] = [];
  const raced: SelectionError[] = [];
  let balance = user.coinBalance;

  for (const selection of valid) {
    try {
      const result = await placeSelection(user._id, selection);
      placed.push(result.bet);
      balance = result.balance;
    } catch (error) {
      raced.push({
        key: selection.key,
        questionId: selection.question._id.toString(),
        optionId: selection.option._id.toString(),
        message:
          error instanceof WalletError
            ? error.message
            : "Could not place this bet. Please try again.",
      });

      if (!(error instanceof WalletError)) {
        console.error("[betting] placement failed", selection.key, error);
      }
    }
  }

  if (placed.length === 0) {
    return {
      ok: false,
      message: raced[0]?.message ?? "Could not place your bets. Please try again.",
      failed: raced,
    };
  }

  return {
    ok: true,
    placed,
    failed: raced,
    totalStake: placed.reduce((sum, bet) => sum + bet.stake, 0),
    balance,
  };
}

type ValidSelection = {
  key: string;
  question: IQuestion;
  match: Pick<IMatch, "_id" | "categoryId" | "status">;
  option: IQuestionOption;
  stake: number;
  potentialWin: number;
};

/**
 * Checks every selection against the server's copy of the market. Expired
 * questions are locked first (4.3, the "check on read" half), so a market whose
 * end time passed while the slip sat open is rejected here rather than accepted
 * because a cron run had not caught up yet.
 */
async function validateSelections(
  selections: BetSelectionInput[],
): Promise<{ valid: ValidSelection[]; failed: SelectionError[] }> {
  const questionIds = [...new Set(selections.map((selection) => selection.questionId))];

  await lockExpiredQuestions({ questionIds });

  const questions = await Question.find({ _id: { $in: questionIds.map(toObjectId) } }).lean<
    IQuestion[]
  >();
  const questionById = new Map(questions.map((question) => [question._id.toString(), question]));

  const matches = await Match.find({
    _id: { $in: [...new Set(questions.map((question) => question.matchId.toString()))].map(toObjectId) },
  })
    .select("status categoryId")
    .lean<Pick<IMatch, "_id" | "categoryId" | "status">[]>();
  const matchById = new Map(matches.map((match) => [match._id.toString(), match]));

  const valid: ValidSelection[] = [];
  const failed: SelectionError[] = [];

  for (const selection of selections) {
    const key = selectionKey(selection.questionId, selection.optionId);
    const reject = (message: string) =>
      failed.push({ key, questionId: selection.questionId, optionId: selection.optionId, message });

    const question = questionById.get(selection.questionId);
    if (!question) {
      reject("This market is no longer available.");
      continue;
    }

    const marketError = marketClosedReason(question.status);
    if (marketError) {
      reject(marketError);
      continue;
    }

    const match = matchById.get(question.matchId.toString());
    if (!match) {
      reject("This market is no longer available.");
      continue;
    }

    if (!BETTABLE_MATCH_STATUSES.includes(match.status)) {
      reject(
        match.status === "cancelled"
          ? "This match was cancelled."
          : "Betting on this match has closed.",
      );
      continue;
    }

    const option = question.options.find(
      (candidate) => candidate._id.toString() === selection.optionId,
    );

    if (!option) {
      reject("That option is no longer available.");
      continue;
    }

    if (option.status !== "active") {
      reject(`${option.name} is suspended.`);
      continue;
    }

    if (selection.stake < question.minStakePerBet) {
      reject(`Minimum stake is ${question.minStakePerBet.toLocaleString()} coins.`);
      continue;
    }

    if (selection.stake > question.maxStakePerBet) {
      reject(`Maximum stake is ${question.maxStakePerBet.toLocaleString()} coins.`);
      continue;
    }

    valid.push({
      key,
      question,
      match,
      option,
      stake: selection.stake,
      potentialWin: potentialWinFor(selection.stake, option.ratio),
    });
  }

  return { valid, failed };
}

function marketClosedReason(status: QuestionStatus): string | null {
  switch (status) {
    case "active":
      return null;
    case "locked":
      return "Betting on this market has closed.";
    case "resolved":
      return "This market has already been settled.";
    case "void":
      return "This market was voided.";
  }
}

/**
 * One selection = one debit + one Bet. The `_id` is minted up front so the
 * ledger row can point at the bet it paid for even though the debit happens
 * first, and both writes share a transaction where the deployment has them.
 */
async function placeSelection(
  userId: Types.ObjectId,
  selection: ValidSelection,
): Promise<{ bet: PlacedBet; balance: number }> {
  const betId = new Types.ObjectId();
  const { question, option, stake, potentialWin } = selection;

  return withWalletTransaction(async (session) => {
    const movement = await applyWalletMovement({
      userId,
      type: "bet_place",
      amount: stake,
      refId: betId,
      note: `Bet: ${option.name}`,
      // Banned mid-slip: caught in the same atomic update as the debit.
      userFilter: { status: "active" },
      preconditionCode: "user_inactive",
      preconditionMessage: "This account can't place bets right now.",
      session,
    });

    try {
      await Bet.create(
        [
          {
            _id: betId,
            userId,
            categoryId: selection.match.categoryId,
            matchId: question.matchId,
            questionId: question._id,
            optionId: option._id,
            // Snapshots — settlement never re-reads the live question.
            optionName: option.name,
            ratio: option.ratio,
            stake,
            potentialWin,
            status: "pending",
            payout: 0,
            settledAt: null,
          },
        ],
        // Mongoose only threads a session through `create` for an array of docs.
        { session, ordered: true },
      );
    } catch (error) {
      // A transaction rolls the debit back for us; a standalone mongod does not,
      // so the stake is handed back with a compensating ledger entry.
      if (!session) await refundFailedPlacement(userId, betId, stake);
      throw error;
    }

    return {
      balance: movement.balanceAfter,
      bet: {
        betId: betId.toString(),
        key: selection.key,
        questionId: question._id.toString(),
        questionText: question.text,
        optionId: option._id.toString(),
        optionName: option.name,
        ratio: option.ratio,
        stake,
        potentialWin,
      },
    };
  });
}

async function refundFailedPlacement(
  userId: Types.ObjectId,
  betId: Types.ObjectId,
  stake: number,
): Promise<void> {
  try {
    await applyWalletMovement({
      userId,
      type: "bet_refund",
      amount: stake,
      refId: betId,
      note: "Bet could not be placed",
    });
  } catch (error) {
    console.error(
      `[betting] FAILED TO REFUND a failed placement of ${stake} for user ${userId.toString()} — ` +
        "the stake was debited but no bet exists; credit it back by hand.",
      error,
    );
  }
}

/* ------------------------------------------------------------------ *
 * 4.3 — locking
 * ------------------------------------------------------------------ */

export type LockScope = {
  matchId?: string | Types.ObjectId;
  questionIds?: (string | Types.ObjectId)[];
  /** Overridable for tests; defaults to now. */
  now?: Date;
};

/**
 * Moves every market past its end time to `locked` (4.3).
 *
 * Called from both directions: the cron route sweeps globally on a schedule,
 * and every read path that could be bet against sweeps its own questions first,
 * so a market is never bettable just because the scheduler is late.
 */
export async function lockExpiredQuestions(scope: LockScope = {}): Promise<number> {
  await connectDB();

  const filter: QueryFilter<IQuestion> = {
    status: "active",
    endDate: { $lte: scope.now ?? new Date() },
  };

  if (scope.matchId) filter.matchId = toObjectId(scope.matchId);
  if (scope.questionIds) {
    if (scope.questionIds.length === 0) return 0;
    filter._id = { $in: scope.questionIds.map(toObjectId) };
  }

  const result = await Question.updateMany(filter, { $set: { status: "locked" } });

  return result.modifiedCount;
}

export type LockToggleResult =
  | { ok: true; status: QuestionStatus; changed: boolean }
  | { ok: false; message: string };

/**
 * Admin lock toggle (4.3). Locking suspends a live market early; unlocking
 * reopens one that was locked by hand — but never one whose end time has
 * already passed, since the next read would simply lock it again.
 */
export async function setQuestionLock(
  questionId: string | Types.ObjectId,
  locked: boolean,
): Promise<LockToggleResult> {
  await connectDB();

  const id = toObjectId(questionId);
  const from: QuestionStatus = locked ? "active" : "locked";
  const to: QuestionStatus = locked ? "locked" : "active";

  const filter: QueryFilter<IQuestion> = { _id: id, status: from };
  if (!locked) filter.endDate = { $gt: new Date() };

  const updated = await Question.findOneAndUpdate(
    filter,
    { $set: { status: to } },
    { returnDocument: "after" },
  ).lean<IQuestion>();

  if (updated) return { ok: true, status: updated.status, changed: true };

  const question = await Question.findById(id).select("status endDate").lean<
    Pick<IQuestion, "status" | "endDate">
  >();

  if (!question) return { ok: false, message: "That question no longer exists." };

  // Already where the admin wanted it — a double-click, not a failure.
  if (question.status === to) return { ok: true, status: to, changed: false };

  if (question.status === "resolved" || question.status === "void") {
    return { ok: false, message: `A ${question.status} question can no longer be locked or unlocked.` };
  }

  if (!locked && question.endDate.getTime() <= Date.now()) {
    return {
      ok: false,
      message: "This market's end time has passed. Push the end time back before reopening it.",
    };
  }

  return { ok: false, message: "That question can't be locked or unlocked right now." };
}

/**
 * Questions for a match, expired ones locked first — the read path Phase 5.4
 * renders the odds buttons from.
 */
export async function loadMatchQuestions(matchId: string | Types.ObjectId): Promise<IQuestion[]> {
  await lockExpiredQuestions({ matchId });

  return Question.find({ matchId: toObjectId(matchId) })
    .sort({ createdAt: 1 })
    .lean<IQuestion[]>();
}

function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return typeof value === "string" ? new Types.ObjectId(value) : value;
}
