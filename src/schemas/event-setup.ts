import { z } from "zod";

import {
  MAX_OPTIONS_PER_QUESTION,
  MAX_TEAMS_PER_MATCH,
  MIN_OPTIONS_PER_QUESTION,
  MIN_TEAMS_PER_MATCH,
} from "@/lib/enums";

import { dateInput, objectId, optionalObjectId, ratio, selectedObjectId } from "@/schemas/common";

/**
 * The guided event builder's payload — one match and all of its betting
 * questions, submitted together.
 *
 * The per-model schemas (`match.ts`, `question.ts`) still own every rule; this
 * one exists because the builder asks for the whole event in a single pass and
 * therefore has to be validated in a single pass, so a mistake on question four
 * is reported *before* a match is written rather than after.
 *
 * Deliberately smaller than the sum of the forms it replaces: stake limits,
 * per-answer suspension and market status are not asked for at all. They have
 * sensible defaults, they can be changed afterwards on the screens that own
 * them, and every field a first-time admin has to form an opinion about is a
 * field that stops them shipping an event.
 */
const wizardOptionSchema = z.object({
  name: z.string().trim().min(1, "Give every answer a name").max(80),
  ratio,
});

const wizardQuestionSchema = z.object({
  text: z.string().trim().min(1, "Write the question players will see").max(200),
  options: z
    .array(wizardOptionSchema)
    .min(MIN_OPTIONS_PER_QUESTION, `Every question needs at least ${MIN_OPTIONS_PER_QUESTION} answers`)
    .max(MAX_OPTIONS_PER_QUESTION, `A question can have at most ${MAX_OPTIONS_PER_QUESTION} answers`)
    .refine(
      (options) => new Set(options.map((o) => o.name.trim().toLowerCase())).size === options.length,
      "Two answers on the same question can't share a name",
    ),
  /**
   * When betting shuts. `true` — the default the builder offers — means "the
   * moment the event starts", which is the answer for almost every event and
   * saves picking a date twice.
   */
  closesAtStart: z.boolean(),
  closesAt: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    dateInput.nullish(),
  ),
});

export const eventSetupSchema = z
  .object({
    categoryId: selectedObjectId,
    tournamentId: optionalObjectId,
    title: z.string().trim().min(1, "Give the event a name").max(140),
    startTime: dateInput,
    teamIds: z
      .array(objectId)
      .min(MIN_TEAMS_PER_MATCH, `Pick at least ${MIN_TEAMS_PER_MATCH} competitors`)
      .max(MAX_TEAMS_PER_MATCH, `Pick at most ${MAX_TEAMS_PER_MATCH} competitors`)
      .refine((ids) => new Set(ids).size === ids.length, "A competitor can only be picked once"),
    questions: z
      .array(wizardQuestionSchema)
      .min(1, "Add at least one betting question — an event with none can't be bet on")
      .max(20, "That's a lot of questions for one event. Add the rest afterwards."),
    /** `false` builds the event with betting closed, to be opened by hand later. */
    openForBetting: z.boolean(),
  })
  .refine(
    (data) =>
      data.questions.every(
        (question) => question.closesAtStart || question.closesAt instanceof Date,
      ),
    { message: "Pick a closing time for every question that doesn't close at kick-off", path: ["questions"] },
  );

export type EventSetupInput = z.infer<typeof eventSetupSchema>;
export type EventSetupQuestion = EventSetupInput["questions"][number];
