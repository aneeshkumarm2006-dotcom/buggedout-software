import { z } from "zod";

import {
  CONTENT_STATUSES,
  MAX_OPTIONS_PER_QUESTION,
  MIN_OPTIONS_PER_QUESTION,
  QUESTION_STATUSES,
} from "@/lib/enums";

import { dateInput, objectId, positiveCoinAmount, ratio } from "@/schemas/common";

/**
 * `_id` is present when editing an existing option row and absent when adding
 * one. Keeping it lets the editor (Phase 6.8) change odds in place without
 * orphaning the `optionId` already snapshotted on placed bets.
 */
export const questionOptionSchema = z.object({
  _id: objectId.optional(),
  name: z.string().trim().min(1, "Option name is required").max(80),
  ratio,
  status: z.enum(CONTENT_STATUSES).default("active"),
});

const optionsArray = z
  .array(questionOptionSchema)
  .min(MIN_OPTIONS_PER_QUESTION, `At least ${MIN_OPTIONS_PER_QUESTION} options`)
  .max(MAX_OPTIONS_PER_QUESTION, `At most ${MAX_OPTIONS_PER_QUESTION} options`)
  .refine(
    (options) => new Set(options.map((o) => o.name.trim().toLowerCase())).size === options.length,
    "Option names must be unique",
  );

const baseQuestionSchema = z.object({
  matchId: objectId,
  text: z.string().trim().min(1, "Question text is required").max(200),
  options: optionsArray,
  status: z.enum(QUESTION_STATUSES),
  endDate: dateInput,
  minStakePerBet: positiveCoinAmount,
  maxStakePerBet: positiveCoinAmount,
});

const maxAboveMin = (data: { minStakePerBet?: number; maxStakePerBet?: number }) =>
  data.minStakePerBet === undefined ||
  data.maxStakePerBet === undefined ||
  data.maxStakePerBet >= data.minStakePerBet;

const MAX_ABOVE_MIN = {
  message: "Max stake must be greater than or equal to min stake",
  path: ["maxStakePerBet"],
};

export const createQuestionSchema = baseQuestionSchema
  .partial({ status: true, minStakePerBet: true, maxStakePerBet: true })
  .refine(maxAboveMin, MAX_ABOVE_MIN);

/** `matchId` is fixed at creation — a question can't be moved between matches. */
export const updateQuestionSchema = baseQuestionSchema
  .omit({ matchId: true })
  .partial()
  .refine(maxAboveMin, MAX_ABOVE_MIN);

/** Pending Results: pick the winning option(s), then settle (Phase 6.9). */
export const resolveQuestionSchema = z.object({
  questionId: objectId,
  winningOptionIds: z
    .array(objectId)
    .min(1, "Pick at least one winning option")
    .max(MAX_OPTIONS_PER_QUESTION)
    .refine((ids) => new Set(ids).size === ids.length, "An option can only be picked once"),
});

export const voidQuestionSchema = z.object({
  questionId: objectId,
  reason: z.string().trim().max(300).optional(),
});

/** Manual lock toggle on a market (Phase 4.3). */
export const setQuestionLockSchema = z.object({
  questionId: objectId,
  locked: z.boolean(),
});

export type QuestionOptionInput = z.infer<typeof questionOptionSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type ResolveQuestionInput = z.infer<typeof resolveQuestionSchema>;
export type VoidQuestionInput = z.infer<typeof voidQuestionSchema>;
export type SetQuestionLockInput = z.infer<typeof setQuestionLockSchema>;
