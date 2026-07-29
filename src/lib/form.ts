/**
 * Shape every `useActionState` form in the app shares. Kept free of server-only
 * imports so client components can hold the initial state without dragging
 * Mongoose or Zod into the browser bundle.
 */
export type FormState = {
  status: "idle" | "error" | "success";
  /** Form-level message: the red banner on error, the green one on success. */
  message?: string;
  /** Per-input messages, keyed by the field's `name`. */
  fieldErrors?: Record<string, string[] | undefined>;
  /**
   * What the user typed, echoed back so a rejected submit doesn't hand them an
   * empty form — React resets uncontrolled inputs once an action settles, and
   * it restores them to `defaultValue`. Never carries passwords.
   */
  values?: Record<string, string>;
};

export const idleFormState: FormState = { status: "idle" };

export function fieldError(state: FormState, field: string): string | undefined {
  return state.fieldErrors?.[field]?.[0];
}
