import { z } from "zod";

import { TRANSACTION_TYPES } from "@/lib/enums";

import { coinAmount, objectId, optionalNote, positiveCoinAmount } from "@/schemas/common";

/**
 * There is no update schema — the ledger is append-only. This shape is what the
 * wallet service (Phase 3.4) validates before writing a row; `amount` is given
 * unsigned here and signed by the service from `TRANSACTION_DIRECTION`.
 */
export const createTransactionSchema = z.object({
  userId: objectId,
  type: z.enum(TRANSACTION_TYPES),
  amount: positiveCoinAmount,
  balanceAfter: coinAmount,
  refId: objectId.optional(),
  note: optionalNote.optional(),
});

/** Filters for the wallet history and the global admin ledger (Phase 6.12). */
export const transactionQuerySchema = z.object({
  userId: objectId.optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
