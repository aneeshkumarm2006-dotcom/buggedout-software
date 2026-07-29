"use client";

import { useActionState } from "react";

import { resetPasswordAction } from "@/app/(auth)/actions";
import { FormAlert, SubmitButton, TextField } from "@/components/auth/form-parts";
import { fieldError, idleFormState } from "@/lib/form";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, idleFormState);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />

      <input type="hidden" name="token" value={token} />

      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        required
        error={fieldError(state, "password")}
        hint="At least 8 characters."
      />

      <TextField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        required
        error={fieldError(state, "confirmPassword")}
      />

      <SubmitButton pending={pending} pendingLabel="Saving…">
        Set new password
      </SubmitButton>
    </form>
  );
}
