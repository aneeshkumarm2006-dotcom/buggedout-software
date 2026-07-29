"use client";

import { useActionState } from "react";

import { createTicketAction } from "@/app/(user)/actions";
import { FormAlert, SubmitButton, TextField } from "@/components/auth/form-parts";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fieldError, idleFormState } from "@/lib/form";

/**
 * Raise a support ticket (Phase 5.10).
 *
 * Same `useActionState` shape as the auth forms, including echoing the typed
 * values back through `defaultValue` — React resets an uncontrolled form once
 * an action settles, and nobody wants to retype a paragraph because a subject
 * line was two characters short.
 */
export function NewTicketForm() {
  const [state, formAction, pending] = useActionState(createTicketAction, idleFormState);
  const messageError = fieldError(state, "message");

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />

      <TextField
        label="Subject"
        name="subject"
        placeholder="What's this about?"
        maxLength={140}
        required
        defaultValue={state.values?.subject}
        error={fieldError(state, "subject")}
      />

      <div className="grid gap-1.5">
        <Label htmlFor="message">Message</Label>
        <Textarea
          id="message"
          name="message"
          rows={5}
          maxLength={4000}
          required
          defaultValue={state.values?.message}
          aria-invalid={messageError ? true : undefined}
          aria-describedby={messageError ? "message-error" : undefined}
          placeholder="Tell us what happened, and include a bet or match name if there is one."
        />
        {messageError ? (
          <p id="message-error" className="text-destructive text-xs">
            {messageError}
          </p>
        ) : null}
      </div>

      <SubmitButton pending={pending} pendingLabel="Opening…">
        Open ticket
      </SubmitButton>
    </form>
  );
}
