import "server-only";

import mongoose, {
  Types,
  type ClientSession,
  type QueryFilter,
  type UpdateQuery,
} from "mongoose";

import { connectDB } from "@/lib/db";
import { TRANSACTION_DIRECTION, type TransactionType } from "@/lib/enums";
import { env } from "@/lib/env";
import { Transaction, User, type IUser } from "@/models";

/**
 * The wallet service — the ONLY code in the app allowed to change
 * `User.coinBalance` (Phase 3.4).
 *
 * Every movement is one guarded `findOneAndUpdate` (which is atomic per
 * document, so two concurrent bets can never both pass a balance check) plus
 * one immutable ledger row carrying the `balanceAfter` the update landed on.
 * That keeps `sum(Transaction.amount) === User.coinBalance` true for every
 * user, which is the invariant the admin ledger and the tests in 9.2 rely on.
 *
 * The two writes are wrapped in a MongoDB transaction where the deployment
 * supports one (replica set / Atlas). A standalone `mongod` — the usual local
 * dev setup — cannot start sessions, so the first attempt detects that once and
 * every later call takes the compensating path instead: if the ledger insert
 * fails, the balance change is rolled back by hand.
 */

export type WalletErrorCode =
  | "user_not_found"
  | "insufficient_funds"
  | "invalid_amount"
  | "user_inactive"
  | "daily_bonus_not_ready";

export class WalletError extends Error {
  constructor(
    readonly code: WalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WalletError";
  }
}

export type WalletMovementInput = {
  userId: string | Types.ObjectId;
  type: TransactionType;
  /** Always a positive magnitude — the sign comes from `TRANSACTION_DIRECTION`. */
  amount: number;
  /** The Bet / Question / User this movement came from, when there is one. */
  refId?: string | Types.ObjectId | null;
  note?: string | null;
  /**
   * Extra conditions ANDed into the guarded user update, so a precondition
   * (a 24h daily-bonus window, an `active` status) is checked in the same
   * atomic operation as the balance change rather than in a racy read-then-write.
   */
  userFilter?: QueryFilter<IUser>;
  /** Fields written to the user inside that same update (e.g. `lastDailyBonusAt`). */
  userSet?: UpdateQuery<IUser>["$set"];
  /** Error code to throw when `userFilter` — rather than the balance — is what failed. */
  preconditionCode?: WalletErrorCode;
  preconditionMessage?: string;
  /** Join a transaction the caller already owns (Phase 4 settles many bets at once). */
  session?: ClientSession;
};

export type WalletMovement = {
  transactionId: Types.ObjectId;
  /** Signed, matching the ledger row. */
  amount: number;
  balanceAfter: number;
};

/** Milliseconds between daily-bonus claims (Phase 3.5). */
export const DAILY_BONUS_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * `null` until the first movement tells us whether this deployment can start
 * sessions; cached for the life of the process so we don't pay a failed
 * transaction attempt per write on standalone MongoDB.
 */
const globalForWallet = globalThis as typeof globalThis & {
  __mongoTransactionsSupported?: boolean;
};

export async function applyWalletMovement(input: WalletMovementInput): Promise<WalletMovement> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new WalletError("invalid_amount", "A wallet movement must be a positive whole number of coins");
  }

  await connectDB();

  // The caller owns the transaction — just do the work inside it.
  if (input.session) return performMovement(input, input.session);

  if (globalForWallet.__mongoTransactionsSupported !== false) {
    const session = await mongoose.startSession();
    try {
      const movement = await session.withTransaction(() => performMovement(input, session));
      globalForWallet.__mongoTransactionsSupported = true;
      return movement;
    } catch (error) {
      if (!isTransactionsUnsupported(error)) throw error;
      globalForWallet.__mongoTransactionsSupported = false;
    } finally {
      await session.endSession();
    }
  }

  return performMovementWithCompensation(input);
}

/**
 * Runs `fn` inside a MongoDB transaction when the deployment supports one, and
 * plainly when it does not. Phase 4 uses this to settle a whole question's bets
 * as one unit; pass the `session` it hands back into `applyWalletMovement`.
 */
export async function withWalletTransaction<T>(
  fn: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  await connectDB();

  if (globalForWallet.__mongoTransactionsSupported === false) return fn(undefined);

  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(() => fn(session));
    globalForWallet.__mongoTransactionsSupported = true;
    return result;
  } catch (error) {
    if (!isTransactionsUnsupported(error)) throw error;
    globalForWallet.__mongoTransactionsSupported = false;
  } finally {
    await session.endSession();
  }

  return fn(undefined);
}

/** Balance change + ledger row. Atomic only if a `session` in a transaction is passed. */
async function performMovement(
  input: WalletMovementInput,
  session: ClientSession | undefined,
): Promise<WalletMovement> {
  const before = await incrementBalance(input, session);
  const balanceAfter = before.coinBalance + signedAmount(input);
  const transactionId = await insertLedgerRow(input, balanceAfter, session);

  return { transactionId, amount: signedAmount(input), balanceAfter };
}

/**
 * Standalone-MongoDB path: the two writes cannot share a transaction, so a
 * failed ledger insert is undone by reversing the balance change (and any
 * `userSet` fields) back to what the update returned.
 */
async function performMovementWithCompensation(input: WalletMovementInput): Promise<WalletMovement> {
  const before = await incrementBalance(input, undefined);
  const delta = signedAmount(input);
  const balanceAfter = before.coinBalance + delta;

  try {
    const transactionId = await insertLedgerRow(input, balanceAfter, undefined);
    return { transactionId, amount: delta, balanceAfter };
  } catch (error) {
    await User.updateOne({ _id: before._id }, buildUndo(input, before)).catch(() => {
      // Nothing left to do but shout: the balance is now ahead of the ledger.
      console.error(
        `[wallet] FAILED TO COMPENSATE ${input.type} of ${delta} for user ${String(before._id)} — ` +
          "balance and ledger are out of sync and need a manual adjusting entry.",
      );
    });
    throw error;
  }
}

/**
 * The guarded update. Returns the document *before* the change, which gives us
 * both the balance to derive `balanceAfter` from and the old values needed to
 * compensate.
 */
async function incrementBalance(
  input: WalletMovementInput,
  session: ClientSession | undefined,
): Promise<IUser> {
  const delta = signedAmount(input);

  const filter: QueryFilter<IUser> = {
    _id: toObjectId(input.userId),
    ...input.userFilter,
  };

  // A debit may never take a balance below zero, and checking it here keeps the
  // check and the write in the same atomic operation.
  if (delta < 0) filter.coinBalance = { $gte: input.amount };

  const update: UpdateQuery<IUser> = { $inc: { coinBalance: delta } };
  if (input.userSet) update.$set = input.userSet;

  const before = await User.findOneAndUpdate(filter, update, {
    // The pre-image is what makes `balanceAfter` and the undo derivable.
    returnDocument: "before",
    session,
  }).lean<IUser>();

  if (before) return before;

  throw await explainMissedUpdate(input, session);
}

async function insertLedgerRow(
  input: WalletMovementInput,
  balanceAfter: number,
  session: ClientSession | undefined,
): Promise<Types.ObjectId> {
  const [row] = await Transaction.create(
    [
      {
        userId: toObjectId(input.userId),
        type: input.type,
        amount: signedAmount(input),
        balanceAfter,
        refId: input.refId ? toObjectId(input.refId) : null,
        note: input.note ?? null,
      },
    ],
    // Mongoose only threads the session through `create` when the docs are an array.
    { session, ordered: true },
  );

  return row._id;
}

/** Re-reads the user to say *why* the guarded update matched nothing. */
async function explainMissedUpdate(
  input: WalletMovementInput,
  session: ClientSession | undefined,
): Promise<WalletError> {
  const user = await User.findById(toObjectId(input.userId))
    .select("coinBalance")
    .session(session ?? null)
    .lean<Pick<IUser, "_id" | "coinBalance">>();

  if (!user) {
    return new WalletError("user_not_found", "That account no longer exists");
  }

  if (signedAmount(input) < 0 && user.coinBalance < input.amount) {
    return new WalletError("insufficient_funds", "Not enough coins for this bet");
  }

  return new WalletError(
    input.preconditionCode ?? "user_inactive",
    input.preconditionMessage ?? "This account cannot move coins right now",
  );
}

/** Reverses the balance change and restores every field `userSet` overwrote. */
function buildUndo(input: WalletMovementInput, before: IUser): UpdateQuery<IUser> {
  const undo: UpdateQuery<IUser> = { $inc: { coinBalance: -signedAmount(input) } };

  if (input.userSet) {
    const restore: Record<string, unknown> = {};
    for (const field of Object.keys(input.userSet)) {
      restore[field] = (before as unknown as Record<string, unknown>)[field] ?? null;
    }
    undo.$set = restore;
  }

  return undo;
}

function signedAmount(input: WalletMovementInput): number {
  return TRANSACTION_DIRECTION[input.type] * input.amount;
}

function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return typeof value === "string" ? new Types.ObjectId(value) : value;
}

/**
 * A standalone `mongod` rejects `startSession`-backed transactions with
 * IllegalOperation (20). Anything else — a genuine write conflict, a validation
 * error — must keep bubbling.
 */
function isTransactionsUnsupported(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, codeName, message } = error as { code?: unknown; codeName?: string; message?: string };
  return (
    code === 20 ||
    codeName === "IllegalOperation" ||
    (typeof message === "string" &&
      (message.includes("Transaction numbers are only allowed on") ||
        message.includes("replica set member or mongos")))
  );
}

/* ------------------------------------------------------------------ *
 * Movements used by Phase 3. Betting movements arrive in Phase 4.
 * ------------------------------------------------------------------ */

/** Credited once, immediately after the account row is created (Phase 3.1). */
export async function creditSignupBonus(
  userId: string | Types.ObjectId,
): Promise<WalletMovement | null> {
  if (env.SIGNUP_BONUS_COINS <= 0) return null;

  return applyWalletMovement({
    userId,
    type: "signup_bonus",
    amount: env.SIGNUP_BONUS_COINS,
    refId: userId,
    note: "Welcome bonus",
  });
}

/**
 * Daily bonus (Phase 3.5). The 24h window is part of the update filter, so two
 * taps on the claim button can't both be credited — the second matches nothing
 * and comes back as `daily_bonus_not_ready`.
 */
export async function claimDailyBonus(userId: string | Types.ObjectId): Promise<WalletMovement> {
  if (env.DAILY_BONUS_COINS <= 0) {
    throw new WalletError("invalid_amount", "The daily bonus is switched off");
  }

  const now = new Date();
  const windowOpensAfter = new Date(now.getTime() - DAILY_BONUS_INTERVAL_MS);

  return applyWalletMovement({
    userId,
    type: "daily_bonus",
    amount: env.DAILY_BONUS_COINS,
    refId: userId,
    note: "Daily bonus",
    userFilter: {
      status: "active",
      $or: [{ lastDailyBonusAt: null }, { lastDailyBonusAt: { $lte: windowOpensAfter } }],
    },
    userSet: { lastDailyBonusAt: now },
    preconditionCode: "daily_bonus_not_ready",
    preconditionMessage: "You have already claimed today's bonus",
  });
}

export type WalletSummary = {
  coinBalance: number;
  lastDailyBonusAt: Date | null;
  /** `null` once the bonus is claimable again. */
  nextDailyBonusAt: Date | null;
  canClaimDailyBonus: boolean;
  dailyBonusAmount: number;
};

/** Balance + daily-bonus state for the header and the wallet page. */
export async function getWalletSummary(
  userId: string | Types.ObjectId,
): Promise<WalletSummary | null> {
  await connectDB();

  const user = await User.findById(toObjectId(userId))
    .select("coinBalance lastDailyBonusAt")
    .lean<Pick<IUser, "coinBalance" | "lastDailyBonusAt">>();

  if (!user) return null;

  const nextAt = nextDailyBonusAt(user.lastDailyBonusAt);
  const canClaim = env.DAILY_BONUS_COINS > 0 && (!nextAt || nextAt.getTime() <= Date.now());

  return {
    coinBalance: user.coinBalance,
    lastDailyBonusAt: user.lastDailyBonusAt,
    nextDailyBonusAt: canClaim ? null : nextAt,
    canClaimDailyBonus: canClaim,
    dailyBonusAmount: env.DAILY_BONUS_COINS,
  };
}

export function nextDailyBonusAt(lastDailyBonusAt: Date | null | undefined): Date | null {
  if (!lastDailyBonusAt) return null;
  return new Date(new Date(lastDailyBonusAt).getTime() + DAILY_BONUS_INTERVAL_MS);
}
