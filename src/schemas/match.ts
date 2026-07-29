import { z } from "zod";

import { MATCH_STATUSES, MAX_TEAMS_PER_MATCH, MIN_TEAMS_PER_MATCH } from "@/lib/enums";

import {
  dateInput,
  objectId,
  optionalObjectId,
  optionalUrl,
  selectedObjectId,
} from "@/schemas/common";

const baseMatchSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(140),
  categoryId: selectedObjectId,
  tournamentId: optionalObjectId,
  teamIds: z
    .array(objectId)
    .min(MIN_TEAMS_PER_MATCH, `Pick at least ${MIN_TEAMS_PER_MATCH} teams`)
    .max(MAX_TEAMS_PER_MATCH, `Pick at most ${MAX_TEAMS_PER_MATCH} teams`)
    .refine((ids) => new Set(ids).size === ids.length, "A team can only be picked once"),
  startTime: dateInput,
  status: z.enum(MATCH_STATUSES),
  /** Kept nullable for post-MVP streaming; no UI reads it. */
  streamUrl: optionalUrl,
});

export const createMatchSchema = baseMatchSchema.partial({
  tournamentId: true,
  status: true,
  streamUrl: true,
});

export const updateMatchSchema = baseMatchSchema.partial();

/** The lock/unlock toggle on the match row (Phase 6.7). */
export const setMatchStatusSchema = z.object({
  status: z.enum(MATCH_STATUSES),
});

/** Cancel the match and refund every stake on it (Phase 4.5). */
export const cancelMatchSchema = z.object({
  matchId: objectId,
  reason: z.string().trim().max(300).optional(),
});

export type CreateMatchInput = z.infer<typeof createMatchSchema>;
export type UpdateMatchInput = z.infer<typeof updateMatchSchema>;
export type SetMatchStatusInput = z.infer<typeof setMatchStatusSchema>;
export type CancelMatchInput = z.infer<typeof cancelMatchSchema>;
