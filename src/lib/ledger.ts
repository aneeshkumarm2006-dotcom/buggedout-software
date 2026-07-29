import "server-only";

import { Types, type QueryFilter } from "mongoose";

import { connectDB } from "@/lib/db";
import type { TransactionType } from "@/lib/enums";
import { Transaction, type ITransaction } from "@/models";

/**
 * The user's own slice of the coin ledger (Phase 5.7).
 *
 * Read-only by construction — the Transaction model rejects every update and
 * delete, so this is a faithful history rather than a mutable "balance log".
 * `amount` arrives signed and `balanceAfter` is the balance that movement
 * landed on, which is what lets the wallet page show a running total without
 * replaying anything.
 */
export type LedgerRow = {
  id: string;
  type: TransactionType;
  /** Signed: credits positive, debits negative. */
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
};

export type LedgerPage = {
  rows: LedgerRow[];
  page: number;
  totalPages: number;
  total: number;
};

export const LEDGER_PER_PAGE = 25;

export async function getUserLedger(
  userId: string | Types.ObjectId,
  options: { page?: number; limit?: number; type?: TransactionType } = {},
): Promise<LedgerPage> {
  await connectDB();

  const limit = options.limit ?? LEDGER_PER_PAGE;
  const page = Math.max(1, options.page ?? 1);

  const filter: QueryFilter<ITransaction> = { userId: toObjectId(userId) };
  if (options.type) filter.type = options.type;

  const [total, rows] = await Promise.all([
    Transaction.countDocuments(filter),
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<ITransaction[]>(),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row._id.toString(),
      type: row.type,
      amount: row.amount,
      balanceAfter: row.balanceAfter,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    })),
    page,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return typeof value === "string" ? new Types.ObjectId(value) : value;
}
