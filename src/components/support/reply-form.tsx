"use client";

import { useActionState } from "react";
import { Loader2Icon, SendIcon } from "lucide-react";

import { replyToTicketAction } from "@/app/(user)/actions";
import { FormAlert } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fieldError, idleFormState } from "@/lib/form";

/**
 * The reply box at the bottom of a ticket thread (Phase 5.10).
 *
 * On success the action revalidates the thread, so the new message arrives from
 * the server rather than being optimistically pushed into a client list — one
 * source of truth for what support can actually see.
 */
export function ReplyForm({ ticketId }: { ticketId: string }) {
  const [state, formAction, pending] = useActionState(replyToTicketAction, idleFormState);
  const bodyError = fieldError(state, "body");

  return (
    <form action={formAction} className="grid gap-3" noValidate>
      <FormAlert state={state} />

      <input type="hidden" name="ticketId" value={ticketId} />

      <div className="grid gap-1.5">
        <Label htmlFor="body">Your reply</Label>
        <Textarea
          id="body"
          name="body"
          rows={3}
          maxLength={4000}
          required
          // A cleared box is the right state after a successful send, so the
          // typed value is only restored when the action came back unhappy.
          defaultValue={state.status === "error" ? state.values?.body : ""}
          aria-invalid={bodyError ? true : undefined}
          aria-describedby={bodyError ? "body-error" : undefined}
          placeholder="Add anything else that might help…"
        />
        {bodyError ? (
          <p id="body-error" className="text-destructive text-xs">
            {bodyError}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending} className="h-11 sm:w-fit md:h-10">
        {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
        {pending ? "Sending…" : "Send reply"}
      </Button>
    </form>
  );
}
