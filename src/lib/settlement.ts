import "server-only";

import { Types } from "mongoose";

import { writeAuditLog } from "@/lib/audit";
import type { Actor } from "@/lib/authz";
import { connectDB } from "@/lib/db";
import type { BetStatus } from "@/lib/enums";
import { creditReferralCommission } from "@/lib/referral";
import { applyWalletMovement, withWalletTransaction } from "@/lib/wallet";
import {
  Bet,
  Match,
  Question,
  User,
  getReferralSetting,
  type IBet,
  type IQuestion,
  type IReferralSetting,
  type IUser,
} from "@/models";

/**
 * Settlement — resolving a market, voiding one, cancelling a whole match
 * (Phase 4.4–4.6), and the referral commission that rides on it (4.7).
 *
 * Two guards make the whole thing safe to run twice (4.6):
 *
 *  1. the question's status transition is a conditional update — the second
 *     caller matches nothing and knows it lost the race;
 *  2. every payout claims its bet with `{ status: "pending" }` in the filter, so
 *     a bet can only ever be paid by the run that flipped it off `pending`.
 *
 * Together they also make settlement *resumable*, which matters more than one
 * giant transaction would: if a payout fails half way through a thousand bets,
 * the successful ones stay paid, the failed one goes back to `pending`, and
 * running the same resolve again finishes the job without paying anyone twice.
 */

export type SettlementErrorCode =
  | "not_found"
  | "invalid_options"
  | "wrong_status"
  | "already_resolved";

export class SettlementError extends Error {
  constructor(
    readonly code: SettlementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SettlementError";
  }
}

export type QuestionSettlement = {
  questionId: string;
  questionText: string;
  /** `false` when the question was already in its final state and this run only finished the payouts. */
  transitioned: boolean;
  betsSettled: number;
  winners: number;
  losers: number;
  refunds: number;
  totalStake: number;
  totalPayout: number;
  commissionPaid: number;
  /** Bets whose payout failed — they are back on `pending` and a retry finishes them. */
  failed: number;
};

export type ResolveQuestionCommand = {
  questionId: string | Types.ObjectId;
  winningOptionIds: string[];
  actor: Actor;
};

/**
 * Marks the winning option(s) and settles every outstanding bet: winners are
 * paid `potentialWin` (the `stake × ratio` snapshot taken at placement), losers
 * are simply closed out (4.4).
 */
export async function resolveQuestion(
  command: ResolveQuestionCommand,
): Promise<QuestionSettlement> {
  await connectDB();

  const questionId = toObjectId(command.questionId);
  const question = await Question.findById(questionId).lean<IQuestion>();

  if (!question) throw new SettlementError("not_found", "That question no longer exists.");

  const winningIds = new Set(command.winningOptionIds);

  if (winningIds.size === 0) {
    throw new SettlementError("invalid_options", "Pick at least one winning option.");
  }

  const optionIds = new Set(question.options.map((option) => option._id.toString()));
  for (const id of winningIds) {
    if (!optionIds.has(id)) {
      throw new SettlementError("invalid_options", "That option is not on this question.");
    }
  }

  const now = new Date();

  // The winner flags are written as a whole array rather than through two
  // `arrayFilters` identifiers: one `$set` of `options` can't be rejected as a
  // path conflict, and resolution is terminal anyway, so there is no concurrent
  // option edit worth preserving.
  const options = question.options.map((option) => ({
    ...option,
    isWinner: winningIds.has(option._id.toString()),
  }));

  const resolved = await Question.findOneAndUpdate(
    { _id: questionId, status: { $in: ["active", "locked"] } },
    {
      $set: {
        status: "resolved",
        resolvedAt: now,
        resolvedBy: toObjectId(command.actor.id),
        options,
      },
    },
    { returnDocument: "after" },
  ).lean<IQuestion>();

  // Losing the transition means someone else moved the question — re-read it
  // rather than judging by the copy taken before the update, which still says
  // `active` when the other run is milliseconds ahead rather than minutes.
  const current = resolved ?? (await Question.findById(questionId).lean<IQuestion>());

  if (!current) throw new SettlementError("not_found", "That question no longer exists.");
  if (!resolved) assertResumableResolve(current, winningIds);

  const settlement = await settlePendingBets(current, winningIds, now);
  settlement.transitioned = !!resolved;

  await writeAuditLog({
    actorId: command.actor.id,
    actorRole: command.actor.role,
    action: "question.resolve",
    entityType: "question",
    entityId: questionId,
    metadata: {
      matchId: question.matchId.toString(),
      winningOptionIds: [...winningIds],
      winningOptions: question.options
        .filter((option) => winningIds.has(option._id.toString()))
        .map((option) => option.name),
      ...settlementMetadata(settlement),
    },
  });

  await completeMatchIfSettled(question.matchId);

  return settlement;
}

/**
 * A second resolve of the same question is only allowed to *finish* the first
 * one. Picking a different winner after coins have moved is not a correction,
 * it is a second, contradictory result — that needs a void.
 */
function assertResumableResolve(question: IQuestion, winningIds: Set<string>): void {
  if (question.status !== "resolved") {
    throw new SettlementError(
      "wrong_status",
      question.status === "void"
        ? "This question was voided and its stakes refunded."
        : "That question can no longer be resolved.",
    );
  }

  const recorded = question.options.filter((option) => option.isWinner).map((o) => o._id.toString());

  const sameResult =
    recorded.length === winningIds.size && recorded.every((id) => winningIds.has(id));

  if (!sameResult) {
    throw new SettlementError(
      "already_resolved",
      "This question was already resolved with a different result.",
    );
  }
}

export type VoidQuestionCommand = {
  questionId: string | Types.ObjectId;
  reason?: string | null;
  actor: Actor;
};

/** Voids one market and refunds every stake on it (4.5). */
export async function voidQuestion(command: VoidQuestionCommand): Promise<QuestionSettlement> {
  await connectDB();

  const questionId = toObjectId(command.questionId);
  const question = await Question.findById(questionId).lean<IQuestion>();

  if (!question) throw new SettlementError("not_found", "That question no longer exists.");

  const settlement = await voidQuestionCore(question, command.actor, new Date());

  await writeAuditLog({
    actorId: command.actor.id,
    actorRole: command.actor.role,
    action: "question.void",
    entityType: "question",
    entityId: questionId,
    metadata: {
      matchId: question.matchId.toString(),
      reason: command.reason ?? null,
      ...settlementMetadata(settlement),
    },
  });

  await completeMatchIfSettled(question.matchId);

  return settlement;
}

/**
 * The void half without the audit row, so cancelling a match can void all of
 * its questions under a single audit entry.
 *
 * A resolved question is left alone: its winners have already been paid, and
 * clawing that back is not what "void" means here.
 */
async function voidQuestionCore(
  question: IQuestion,
  actor: Actor,
  now: Date,
): Promise<QuestionSettlement> {
  if (question.status === "resolved") {
    throw new SettlementError(
      "wrong_status",
      "This question has already been resolved and paid out.",
    );
  }

  const voided = await Question.findOneAndUpdate(
    { _id: question._id, status: { $in: ["active", "locked"] } },
    {
      $set: {
        status: "void",
        resolvedAt: now,
        resolvedBy: toObjectId(actor.id),
        options: question.options.map((option) => ({ ...option, isWinner: false })),
      },
    },
    { returnDocument: "after" },
  ).lean<IQuestion>();

  // Losing the transition means something else took the question. Re-read it
  // instead of trusting the copy from before the update: a concurrent void is
  // this run finishing that one's refunds, a concurrent resolve is not.
  const current = voided ?? (await Question.findById(question._id).lean<IQuestion>());

  if (!current) throw new SettlementError("not_found", "That question no longer exists.");

  if (!voided && current.status !== "void") {
    throw new SettlementError(
      "wrong_status",
      current.status === "resolved"
        ? "This question was resolved a moment ago and can no longer be voided."
        : "That question can no longer be voided.",
    );
  }

  // `null` outcome = refund everyone.
  const settlement = await settlePendingBets(current, null, now);
  settlement.transitioned = !!voided;

  return settlement;
}

export type CancelMatchCommand = {
  matchId: string | Types.ObjectId;
  reason?: string | null;
  actor: Actor;
};

export type MatchCancellation = {
  matchId: string;
  transitioned: boolean;
  questions: QuestionSettlement[];
  /** Markets already resolved and paid — left untouched by the cancellation. */
  skippedResolved: number;
  totalRefunded: number;
  betsRefunded: number;
};

/** Cancels a match and refunds every stake on every market it carries (4.5). */
export async function cancelMatch(command: CancelMatchCommand): Promise<MatchCancellation> {
  await connectDB();

  const matchId = toObjectId(command.matchId);
  const now = new Date();

  const cancelled = await Match.findOneAndUpdate(
    { _id: matchId, status: { $ne: "cancelled" } },
    { $set: { status: "cancelled" } },
    { returnDocument: "after" },
  ).lean();

  if (!cancelled) {
    const exists = await Match.exists({ _id: matchId });
    if (!exists) throw new SettlementError("not_found", "That match no longer exists.");
    // Already cancelled: fall through and finish refunding whatever is left.
  }

  // `void` is included so a cancel that failed part way through can be re-run
  // and pick up the questions whose refunds never completed.
  const questions = await Question.find({
    matchId,
    status: { $in: ["active", "locked", "void"] },
  }).lean<IQuestion[]>();

  const skippedResolved = await Question.countDocuments({ matchId, status: "resolved" });

  const settlements: QuestionSettlement[] = [];

  for (const question of questions) {
    try {
      settlements.push(await voidQuestionCore(question, command.actor, now));
    } catch (error) {
      // One market losing a race to a resolve shouldn't strand the others.
      console.error("[settlement] could not void question", question._id.toString(), error);
    }
  }

  const result: MatchCancellation = {
    matchId: matchId.toString(),
    transitioned: !!cancelled,
    questions: settlements,
    skippedResolved,
    totalRefunded: settlements.reduce((sum, s) => sum + s.totalPayout, 0),
    betsRefunded: settlements.reduce((sum, s) => sum + s.refunds, 0),
  };

  await writeAuditLog({
    actorId: command.actor.id,
    actorRole: command.actor.role,
    action: "match.cancel",
    entityType: "match",
    entityId: matchId,
    metadata: {
      reason: command.reason ?? null,
      questionsVoided: settlements.length,
      skippedResolved,
      betsRefunded: result.betsRefunded,
      totalRefunded: result.totalRefunded,
      replay: !cancelled,
    },
  });

  return result;
}

/* ------------------------------------------------------------------ *
 * The settlement loop
 * ------------------------------------------------------------------ */

type Outcome = { status: BetStatus; payout: number };

/**
 * Passes over the pending bets. More than one because a bet can be inserted
 * microseconds after the status transition — placement validated against a
 * question that was still open — and that bet would otherwise sit `pending`
 * forever on a settled market.
 */
const MAX_SETTLEMENT_PASSES = 3;

/**
 * Settles every bet still `pending` on a question. `winningIds` of `null` means
 * "void" — everyone gets their stake back.
 */
async function settlePendingBets(
  question: IQuestion,
  winningIds: Set<string> | null,
  now: Date,
): Promise<QuestionSettlement> {
  const settlement: QuestionSettlement = {
    questionId: question._id.toString(),
    questionText: question.text,
    transitioned: true,
    betsSettled: 0,
    winners: 0,
    losers: 0,
    refunds: 0,
    totalStake: 0,
    totalPayout: 0,
    commissionPaid: 0,
    failed: 0,
  };

  const setting = await getReferralSetting();
  // By id, so a bet retried on the next pass isn't counted as two failures.
  const failedBets = new Set<string>();

  for (let pass = 0; pass < MAX_SETTLEMENT_PASSES; pass += 1) {
    const bets = await Bet.find({ questionId: question._id, status: "pending" }).lean<IBet[]>();
    if (bets.length === 0) break;

    const referrers = await loadReferrers(bets, setting);
    const settledBefore = settlement.betsSettled;

    for (const bet of bets) {
      const outcome = outcomeFor(bet, winningIds);

      let settled = false;
      try {
        settled = await settleOneBet(bet, outcome, now);
      } catch (error) {
        failedBets.add(bet._id.toString());
        console.error("[settlement] failed to settle bet", bet._id.toString(), error);
        continue;
      }

      // Already settled by an earlier run — the guard that makes 4.6 hold.
      if (!settled) continue;

      settlement.betsSettled += 1;
      settlement.totalStake += bet.stake;
      settlement.totalPayout += outcome.payout;

      if (outcome.status === "won") settlement.winners += 1;
      else if (outcome.status === "lost") settlement.losers += 1;
      else settlement.refunds += 1;

      // Commission is paid after the bet is safely settled, never inside its
      // transaction: a referral bonus failing must not undo a payout (4.7).
      const referrer = referrers.get(bet.userId.toString());
      if (referrer) {
        settlement.commissionPaid += await creditReferralCommission({
          referrerId: referrer.referrerId,
          betId: bet._id,
          bettorName: referrer.username,
          setting,
          bet: { status: outcome.status, stake: bet.stake, payout: outcome.payout },
        });
      }
    }

    // Nothing moved: every bet left is one whose payout keeps failing, and
    // another identical pass won't change that. The next resolve picks them up.
    if (settlement.betsSettled === settledBefore) break;
  }

  settlement.failed = failedBets.size;

  return settlement;
}

function outcomeFor(bet: IBet, winningIds: Set<string> | null): Outcome {
  if (!winningIds) return { status: "refunded", payout: bet.stake };

  return winningIds.has(bet.optionId.toString())
    ? // The snapshot, not a fresh `stake × ratio` — the odds may have been
      // edited since, and the user was promised this number.
      { status: "won", payout: bet.potentialWin }
    : { status: "lost", payout: 0 };
}

/**
 * Claims one bet and pays it. Returns `false` when another run already settled
 * it, which is what stops a double payout (4.6).
 */
async function settleOneBet(bet: IBet, outcome: Outcome, now: Date): Promise<boolean> {
  return withWalletTransaction(async (session) => {
    const claimed = await Bet.findOneAndUpdate(
      { _id: bet._id, status: "pending" },
      { $set: { status: outcome.status, payout: outcome.payout, settledAt: now } },
      { session, returnDocument: "after" },
    ).lean<IBet>();

    if (!claimed) return false;

    if (outcome.payout <= 0) return true;

    try {
      await applyWalletMovement({
        userId: bet.userId,
        type: outcome.status === "won" ? "bet_win" : "bet_refund",
        amount: outcome.payout,
        refId: bet._id,
        note: outcome.status === "won" ? `Won: ${bet.optionName}` : `Refund: ${bet.optionName}`,
        session,
      });
    } catch (error) {
      // In a transaction the claim rolls back with the payout. Without one, put
      // the bet back on `pending` by hand so a retry can settle it properly
      // rather than leaving it marked won and unpaid.
      if (!session) {
        await Bet.updateOne(
          { _id: bet._id, status: outcome.status },
          { $set: { status: "pending", payout: 0, settledAt: null } },
        ).catch((revertError) => {
          console.error(
            `[settlement] FAILED TO REVERT bet ${bet._id.toString()} after a failed payout — ` +
              "it is marked settled but was never paid.",
            revertError,
          );
        });
      }

      throw error;
    }

    return true;
  });
}

type ReferrerRef = { referrerId: Types.ObjectId; username: string };

/** One lookup for every bettor on the question, rather than one per bet. */
async function loadReferrers(
  bets: IBet[],
  setting: IReferralSetting,
): Promise<Map<string, ReferrerRef>> {
  const referrers = new Map<string, ReferrerRef>();

  if (!setting.enabled || setting.commissionPercent <= 0) return referrers;

  const userIds = [...new Set(bets.map((bet) => bet.userId.toString()))];

  const users = await User.find({
    _id: { $in: userIds.map(toObjectId) },
    referredBy: { $ne: null },
  })
    .select("referredBy username")
    .lean<Pick<IUser, "_id" | "referredBy" | "username">[]>();

  for (const user of users) {
    if (user.referredBy) {
      referrers.set(user._id.toString(), {
        referrerId: user.referredBy,
        username: user.username,
      });
    }
  }

  return referrers;
}

/**
 * A match whose markets are all settled is done. Best-effort: the payouts are
 * what matter, and an admin can always set the status by hand.
 */
async function completeMatchIfSettled(matchId: Types.ObjectId): Promise<void> {
  try {
    const open = await Question.countDocuments({
      matchId,
      status: { $in: ["active", "locked"] },
    });

    if (open > 0) return;

    await Match.updateOne(
      { _id: matchId, status: { $in: ["upcoming", "live", "locked"] } },
      { $set: { status: "resolved" } },
    );
  } catch (error) {
    console.error("[settlement] could not complete match", matchId.toString(), error);
  }
}

function settlementMetadata(settlement: QuestionSettlement): Record<string, unknown> {
  return {
    betsSettled: settlement.betsSettled,
    winners: settlement.winners,
    losers: settlement.losers,
    refunds: settlement.refunds,
    totalStake: settlement.totalStake,
    totalPayout: settlement.totalPayout,
    commissionPaid: settlement.commissionPaid,
    failed: settlement.failed,
    replay: !settlement.transitioned,
  };
}

/* ------------------------------------------------------------------ *
 * Payout impact — the confirm dialog in Phase 6.9
 * ------------------------------------------------------------------ */

export type SettlementPreview = {
  questionId: string;
  pendingBets: number;
  uniqueBettors: number;
  totalStake: number;
  /** What settling with the given winners would cost. */
  totalPayout: number;
  perOption: {
    optionId: string;
    optionName: string;
    isWinner: boolean;
    bets: number;
    stake: number;
    payout: number;
  }[];
};

/** What resolving with these winners would pay out, before anyone commits to it. */
export async function previewQuestionSettlement(
  questionId: string | Types.ObjectId,
  winningOptionIds: string[] = [],
): Promise<SettlementPreview> {
  await connectDB();

  const id = toObjectId(questionId);
  const question = await Question.findById(id).lean<IQuestion>();

  if (!question) throw new SettlementError("not_found", "That question no longer exists.");

  const winningIds = new Set(winningOptionIds);

  const grouped = await Bet.aggregate<{
    _id: Types.ObjectId;
    bets: number;
    stake: number;
    payout: number;
    bettors: Types.ObjectId[];
  }>([
    { $match: { questionId: id, status: "pending" } },
    {
      $group: {
        _id: "$optionId",
        bets: { $sum: 1 },
        stake: { $sum: "$stake" },
        payout: { $sum: "$potentialWin" },
        bettors: { $addToSet: "$userId" },
      },
    },
  ]);

  const byOption = new Map(grouped.map((row) => [row._id.toString(), row]));
  const bettors = new Set(
    grouped.flatMap((row) => row.bettors.map((userId) => userId.toString())),
  );

  const perOption = question.options.map((option) => {
    const optionId = option._id.toString();
    const row = byOption.get(optionId);
    const isWinner = winningIds.has(optionId);

    return {
      optionId,
      optionName: option.name,
      isWinner,
      bets: row?.bets ?? 0,
      stake: row?.stake ?? 0,
      payout: isWinner ? (row?.payout ?? 0) : 0,
    };
  });

  return {
    questionId: id.toString(),
    pendingBets: perOption.reduce((sum, option) => sum + option.bets, 0),
    uniqueBettors: bettors.size,
    totalStake: perOption.reduce((sum, option) => sum + option.stake, 0),
    totalPayout: perOption.reduce((sum, option) => sum + option.payout, 0),
    perOption,
  };
}

function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return typeof value === "string" ? new Types.ObjectId(value) : value;
}
