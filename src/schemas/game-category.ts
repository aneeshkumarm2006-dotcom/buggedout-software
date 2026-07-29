import { z } from "zod";

import { CONTENT_STATUSES, MAX_OPTIONS_PER_QUESTION, MIN_OPTIONS_PER_QUESTION } from "@/lib/enums";

import { imagePath, optionalImagePath, ratio, slug } from "@/schemas/common";

export const marketTemplateSchema = z.object({
  question: z.string().trim().min(1, "Question text is required").max(200),
  options: z
    .array(z.string().trim().min(1, "Option name is required").max(80))
    .min(MIN_OPTIONS_PER_QUESTION, `At least ${MIN_OPTIONS_PER_QUESTION} options`)
    .max(MAX_OPTIONS_PER_QUESTION, `At most ${MAX_OPTIONS_PER_QUESTION} options`)
    .refine(
      (options) => new Set(options.map((o) => o.toLowerCase())).size === options.length,
      "Option names must be unique",
    ),
  defaultRatio: ratio,
});

const baseGameCategorySchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(80),
  slug,
  cardImage: imagePath,
  animatedCard: optionalImagePath,
  status: z.enum(CONTENT_STATUSES),
  sortOrder: z.coerce.number().int().min(0),
  marketTemplates: z.array(marketTemplateSchema),
});

export const createGameCategorySchema = baseGameCategorySchema.partial({
  animatedCard: true,
  status: true,
  sortOrder: true,
  marketTemplates: true,
});

export const updateGameCategorySchema = baseGameCategorySchema.partial();

export type MarketTemplateInput = z.infer<typeof marketTemplateSchema>;
export type CreateGameCategoryInput = z.infer<typeof createGameCategorySchema>;
export type UpdateGameCategoryInput = z.infer<typeof updateGameCategorySchema>;
