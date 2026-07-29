import { Schema, model, models, type Model, type Types } from "mongoose";

import { TRANSACTION_TYPES, type TransactionType } from "@/lib/enums";

/**
 * Append-only coin ledger. Every movement of `User.coinBalance` writes exactly
 * one row inside the same transaction as the balance update (wallet service,
 * Phase 3.4), so `sum(amount)` for a user must always equal their balance.
 *
 * `amount` is SIGNED (see `TRANSACTION_DIRECTION`): credits positive, debits
 * negative. `balanceAfter` is the balance the update landed on, which is what
 * makes the wallet history auditable without replaying the whole ledger.
 *
 * Rows are immutable — the hooks below reject any update or delete.
 */
export interface ITransaction {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  /** The Bet / User / Question this movement came from, when there is one. */
  refId: Types.ObjectId | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: (amount: number) => amount !== 0,
        message: "A ledger entry cannot move zero coins",
      },
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    refId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    note: {
      type: String,
      default: null,
      maxlength: 300,
    },
  },
  { timestamps: true },
);

// Wallet history and the global admin ledger, newest first.
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });

function rejectLedgerMutation(): never {
  throw new Error(
    "Transaction rows are immutable — write a compensating entry instead of editing the ledger.",
  );
}

transactionSchema.pre("save", function () {
  if (!this.isNew) rejectLedgerMutation();
});

transactionSchema.pre(
  [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "findOneAndReplace",
    "replaceOne",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
  ],
  { query: true, document: false },
  rejectLedgerMutation,
);

export const Transaction =
  (models.Transaction as Model<ITransaction> | undefined) ??
  model<ITransaction>("Transaction", transactionSchema);
