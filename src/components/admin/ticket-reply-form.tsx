"use client";

import { useActionState } from "react";
import { Loader2Icon, SendIcon } from "lucide-react";

import { replyToTicketAction } from "@/app/(admin)/ops-actions";
import { FormAlert, useFormToast } from "@/components/admin/form-parts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fieldError, idleFormState } from "@/lib/form";

/**
 * The staff reply box (Phase 6.14).
 *
 * On success the action revalidates both sides of the thread, so the new
 * message arrives from the server rather than being pushed into a client list —
 * what staff see and what the user sees come from the same read.
 */
export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const [state, formAction, pending] = useActionState(
    replyToTicketAction.bind(null, ticketId),
    idleFormState,
  );
  useFormToast(state);

  const bodyError = fieldError(state, "body");

  return (
    <form action={formAction} className="grid gap-3" noValidate>
      <FormAlert state={state} />

      <div className="grid gap-1.5">
        <Label htmlFor="body">Reply</Label>

        <Textarea
          id="body"
          name="body"
          rows={4}
          maxLength={4000}
          required
          // A cleared box is right after a successful send, so the typed value
          // only comes back when the action was unhappy with it.
          defaultValue={state.status === "error" ? state.values?.body : ""}
          aria-invalid={bodyError ? true : undefined}
          aria-describedby={bodyError ? "body-error" : undefined}
          placeholder="Answer the question, and say what happens next…"
        />

        {bodyError ? (
          <p id="body-error" className="text-destructive text-xs">
            {bodyError}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Sending marks the ticket answered and hands it back to the user.
          </p>
        )}
      </div>

      <Button type="submit" size="lg" disabled={pending} className="w-fit">
        {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
        {pending ? "Sending…" : "Send reply"}
      </Button>
    </form>
  );
}
