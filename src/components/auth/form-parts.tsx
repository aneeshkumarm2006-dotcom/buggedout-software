"use client";

import type * as React from "react";
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/form";
import { cn } from "@/lib/utils";

/**
 * The bits every auth form repeats: a form-level banner, a labelled input that
 * knows how to show its own error, and a submit button that reflects `pending`.
 * Inputs are 44px tall here rather than the 32px shadcn default — these forms
 * are thumb-operated on a phone.
 */

export function FormAlert({ state }: { state: FormState }) {
  if (!state.message) return null;

  const isSuccess = state.status === "success";

  return (
    <Alert
      variant={isSuccess ? "default" : "destructive"}
      className={cn(isSuccess && "text-primary")}
      aria-live="polite"
    >
      {isSuccess ? <CheckCircle2Icon /> : <AlertCircleIcon />}
      <AlertDescription className={isSuccess ? "text-primary/90" : undefined}>
        {state.message}
      </AlertDescription>
    </Alert>
  );
}

type TextFieldProps = React.ComponentProps<"input"> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  /** Sits opposite the label — the "Forgot password?" link, for instance. */
  labelAction?: React.ReactNode;
};

export function TextField({
  label,
  name,
  error,
  hint,
  labelAction,
  className,
  ...props
}: TextFieldProps) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={name}>{label}</Label>
        {labelAction}
      </div>
      <Input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn("h-11 md:h-10", className)}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
  pendingLabel,
}: {
  pending: boolean;
  children: React.ReactNode;
  pendingLabel?: string;
}) {
  return (
    <Button type="submit" disabled={pending} className="h-11 w-full text-sm md:h-10">
      {pending ? (
        <>
          <Loader2Icon className="animate-spin" />
          {pendingLabel ?? "Please wait…"}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
