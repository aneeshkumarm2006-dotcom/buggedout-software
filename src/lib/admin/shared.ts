import "server-only";

import { Types } from "mongoose";
import { z } from "zod";

import type { FormState } from "@/lib/form";

/**
 * The bits every admin mutation repeats (Phase 6.1).
 *
 * Forms return `FormState` so `useActionState` can drive them exactly like the
 * user-site forms do; row buttons (delete, ban, lock) return `ActionResult`,
 * which is just a message the caller turns into a toast.
 */
export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

/** What a `lib/admin/*` write hands back — `field` steers the error to an input. */
export type MutationResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string; field?: string };

export const NOT_ALLOWED = "You don't have permission to do that.";
export const GENERIC_ERROR = "Something went wrong. Please try again.";

export function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return typeof value === "string" ? new Types.ObjectId(value) : value;
}

export function isValidObjectId(value: string | undefined | null): value is string {
  return !!value && /^[0-9a-fA-F]{24}$/.test(value);
}

/**
 * A unique-index violation. Catching this beats pre-checking: a "is this slug
 * taken?" read followed by a write is a race, the index is not.
 */
export function duplicateKeyField(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  const { code, keyPattern } = error as { code?: unknown; keyPattern?: Record<string, unknown> };
  if (code !== 11000 || !keyPattern) return null;

  return Object.keys(keyPattern)[0] ?? null;
}

/** Reads the named fields off a submitted form, for echoing back on rejection. */
export function formValues(formData: FormData, keys: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};

  for (const key of keys) {
    const value = formData.get(key);
    values[key] = typeof value === "string" ? value : "";
  }

  return values;
}

/** Turns a failed parse into the field-error shape the inputs read. */
export function invalidFormState(
  error: z.ZodError,
  values?: Record<string, string>,
): FormState {
  const flattened = z.flattenError(error);

  return {
    status: "error",
    values,
    message: flattened.formErrors[0],
    fieldErrors: flattened.fieldErrors,
  };
}

export function failedFormState(message: string, values?: Record<string, string>): FormState {
  return { status: "error", message, values };
}

/**
 * Dynamic sub-forms (market templates, question options, team pickers) travel
 * as JSON in a hidden input — a `FormData` can't carry a nested array without
 * inventing a naming convention, and the client already holds them as state.
 */
export function parseJsonField(formData: FormData, name: string): unknown {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.trim() === "") return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
