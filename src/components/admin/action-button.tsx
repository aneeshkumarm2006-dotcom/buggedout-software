"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Row-level admin actions — lock, delete, ban, void, cancel (Phase 6.1).
 *
 * These are one-shot server actions rather than forms, so they don't go through
 * `useActionState`: the button runs the action in a transition, toasts whatever
 * comes back and refreshes the server component underneath it. Anything
 * irreversible goes through `ConfirmActionButton` instead, which makes the
 * admin read what it is about to do first.
 */
export type ActionOutcome = { ok: boolean; message: string };

type ButtonVariant = React.ComponentProps<typeof Button>["variant"];
type ButtonSize = React.ComponentProps<typeof Button>["size"];

export function ActionButton({
  action,
  children,
  variant = "outline",
  size = "sm",
  disabled,
  className,
  title,
}: {
  action: () => Promise<ActionOutcome>;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await action();

      if (result.ok) {
        toast.success(result.message);
        // The list around this button is a server component; this is what
        // repaints it with the row's new state.
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled || pending}
      onClick={run}
      className={className}
      title={title}
    >
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

export function ConfirmActionButton({
  action,
  title,
  description,
  confirmLabel = "Confirm",
  confirmVariant = "destructive",
  children,
  variant = "outline",
  size = "sm",
  disabled,
  className,
  reason,
  onDone,
}: {
  /** The reason is always passed; actions that don't take one just ignore it. */
  action: (reason: string) => Promise<ActionOutcome>;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
  /** Adds a reason box that is written into the audit log. */
  reason?: { label: string; placeholder?: string; required?: boolean };
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (reason?.required && note.trim() === "") {
      setError("Please give a reason — it goes into the audit log.");
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await action(note.trim());

      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        setNote("");
        router.refresh();
        onDone?.();
      } else {
        // Kept in the dialog rather than a toast: the admin is looking here.
        setError(result.message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={variant} size={size} disabled={disabled} className={className}>
          {children}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {reason ? (
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-reason">{reason.label}</Label>
            <Textarea
              id="confirm-reason"
              rows={2}
              maxLength={300}
              value={note}
              placeholder={reason.placeholder}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        ) : null}

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant={confirmVariant}
            size="lg"
            disabled={pending}
            onClick={confirm}
          >
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
