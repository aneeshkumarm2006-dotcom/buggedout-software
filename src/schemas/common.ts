import { z } from "zod";

import { MAX_RATIO, MIN_RATIO } from "@/lib/enums";

/**
 * Building blocks shared by the per-model input schemas. Everything here is
 * written to accept the string-ish values that come off HTML forms and JSON
 * bodies, and to hand back the parsed type the model expects.
 */

/** A 24-hex Mongo ObjectId as it travels over the wire. */
export const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

/**
 * The same shape behind a `<select>`. An untouched Radix select posts nothing,
 * which arrives as `""` — "Invalid id" is a true statement and a useless one to
 * show under a picker labelled "Game", so these get their own wording.
 */
export const selectedObjectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "Make a selection");

/**
 * An unselected `<select>` and an untouched text input both post `""`. Every
 * optional field below funnels through this so a blank means "not set" rather
 * than "invalid".
 */
const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const optionalObjectId = z
  .preprocess(blankToNull, objectId.nullish())
  .transform((value) => value ?? null);

/** Coins are whole numbers — there are no fractional balances anywhere. */
export const coinAmount = z.coerce
  .number()
  .int("Coins must be a whole number")
  .nonnegative("Coins cannot be negative");

export const positiveCoinAmount = z.coerce
  .number()
  .int("Coins must be a whole number")
  .positive("Amount must be greater than zero");

/** Payout multiplier. Below 1 the bet would pay less than the stake. */
export const ratio = z.coerce
  .number()
  .min(MIN_RATIO, `Ratio must be at least ${MIN_RATIO}`)
  .max(MAX_RATIO, `Ratio must be at most ${MAX_RATIO}`);

/** Accepts a `Date`, an ISO string, or a `datetime-local` input value. */
export const dateInput = z.coerce.date();

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Slug is required")
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");

/** Local path (`/game-cards/roulette.webp`) or absolute URL. */
export const imagePath = z
  .string()
  .trim()
  .min(1, "An image is required")
  .max(500)
  .refine(
    (value) => value.startsWith("/") || /^https?:\/\//.test(value) || value.startsWith("data:image/"),
    "Must be a site path, an http(s) URL, or a data URL",
  );

export const optionalImagePath = z
  .preprocess(blankToNull, imagePath.nullish())
  .transform((value) => value ?? null);

/**
 * Piped rather than chained: in Zod 4 a format check runs before `.trim()`, so
 * `z.url().trim()` would reject a value that only had stray whitespace.
 */
export const optionalUrl = z
  .preprocess(
    blankToNull,
    z.string().trim().max(500).pipe(z.url("Must be a valid URL")).nullish(),
  )
  .transform((value) => value ?? null);

/**
 * HTML checkboxes post `"on"` when ticked and nothing at all when not.
 * `z.coerce.boolean()` is the wrong tool here — it uses JS truthiness, so the
 * string `"false"` would coerce to `true`.
 */
export const checkbox = z
  .preprocess(
    (value) => value === true || value === "true" || value === "on" || value === "1",
    z.boolean(),
  )
  .default(false);

export const optionalNote = z
  .string()
  .trim()
  .max(300)
  .nullish()
  .transform((value) => value || null);

/** Shared list-endpoint query: `?page=2&limit=50&q=turtle`. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
