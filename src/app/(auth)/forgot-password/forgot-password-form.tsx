"use client";

import { useActionState } from "react";

import { requestPasswordResetAction } from "@/app/(auth)/actions";
import { FormAlert, SubmitButton, TextField } from "@/components/auth/form-parts";
import { fieldError, idleFormState } from "@/lib/form";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    idleFormState,
  );

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />

      {/* On success the form is done — leaving it up invites a second send. */}
      {state.status === "success" ? null : (
        <>
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            required
            defaultValue={state.values?.email}
            error={fieldError(state, "email")}
          />

          <SubmitButton pending={pending} pendingLabel="Sending…">
            Send reset link
          </SubmitButton>
        </>
      )}
    </form>
  );
}
