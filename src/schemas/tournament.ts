import { z } from "zod";

import { TOURNAMENT_STATUSES } from "@/lib/enums";

import { dateInput, selectedObjectId } from "@/schemas/common";

const baseTournamentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  categoryId: selectedObjectId,
  startDate: dateInput,
  endDate: dateInput,
  status: z.enum(TOURNAMENT_STATUSES),
});

/** Only enforceable when both dates are present — skipped on a partial update. */
const endAfterStart = (data: { startDate?: Date; endDate?: Date }) =>
  !data.startDate || !data.endDate || data.endDate >= data.startDate;

const END_AFTER_START = {
  message: "End date must be on or after the start date",
  path: ["endDate"],
};

export const createTournamentSchema = baseTournamentSchema
  .partial({ status: true })
  .refine(endAfterStart, END_AFTER_START);

export const updateTournamentSchema = baseTournamentSchema
  .partial()
  .refine(endAfterStart, END_AFTER_START);

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
