import { z } from "zod";

import { BET_STATUSES } from "@/lib/enums";

import { objectId, positiveCoinAmount } from "@/schemas/common";

/**
 * One bet-slip selection. `optionName`, `ratio` and `potentialWin` are NOT
 * accepted from the client — the server reads them off the live Question and
 * snapshots them onto the Bet, so a tampered payload can't buy better odds.
 */
export const betSelectionSchema = z.object({
  questionId: objectId,
  optionId: objectId,
  stake: positiveCoinAmount,
});

/** The slip submits every selection at once; each becomes an independent bet. */
export const placeBetsSchema = z.object({
  selections: z
    .array(betSelectionSchema)
    .min(1, "Add at least one selection")
    .max(20, "At most 20 selections per submit")
    .refine(
      (selections) =>
        new Set(selections.map((s) => `${s.questionId}:${s.optionId}`)).size === selections.length,
      "The same option appears twice in the slip",
    ),
});

/** Filters for My Bets (Phase 5.6) and the admin bet history (Phase 6.12). */
export const betQuerySchema = z.object({
  status: z.enum(BET_STATUSES).optional(),
  /** `open` = pending, `settled` = everything else — the two My Bets tabs. */
  tab: z.enum(["open", "settled"]).optional(),
  userId: objectId.optional(),
  categoryId: objectId.optional(),
  matchId: objectId.optional(),
  questionId: objectId.optional(),
});

export type BetSelectionInput = z.infer<typeof betSelectionSchema>;
export type PlaceBetsInput = z.infer<typeof placeBetsSchema>;
export type BetQuery = z.infer<typeof betQuerySchema>;
