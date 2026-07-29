"use client";

import { useActionState } from "react";

import { changePasswordAction } from "@/app/(user)/actions";
import { FormAlert, SubmitButton, TextField } from "@/components/auth/form-parts";
import { fieldError, idleFormState } from "@/lib/form";

/**
 * Change password (Phase 5.11).
 *
 * Nothing is echoed back on failure — every field here is a password, and the
 * one rule `pickValues` follows elsewhere is that those never travel back out
 * of the server.
 */
export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, idleFormState);

  return (
    <form
      action={formAction}
      className="grid gap-4"
      noValidate
      // Remounts on success, which is what clears the three boxes.
      key={state.status === "success" ? "saved" : "editing"}
    >
      <FormAlert state={state} />

      <TextField
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={fieldError(state, "currentPassword")}
      />

      <TextField
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        required
        error={fieldError(state, "newPassword")}
        hint="At least 8 characters."
      />

      <TextField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={fieldError(state, "confirmPassword")}
      />

      <SubmitButton pending={pending} pendingLabel="Updating…">
        Change password
      </SubmitButton>
    </form>
  );
}
