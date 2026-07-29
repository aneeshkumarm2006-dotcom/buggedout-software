"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/form";
import { cn } from "@/lib/utils";

/**
 * The building blocks the admin forms share (Phase 6.1).
 *
 * The text input, the form banner and the submit button come from
 * `components/auth/form-parts` — the same three widgets, already 44px tall for
 * a thumb — so this file only adds what admin work needs on top: selects,
 * textareas, checkboxes, a card to group fields and the success toast every
 * mutation owes the person who pressed the button.
 */
export { FormAlert, SubmitButton, TextField } from "@/components/auth/form-parts";

/**
 * Toasts once per settled submit. Errors stay in the banner beside the field
 * that caused them — a toast that has scrolled away is no help in a long form.
 */
export function useFormToast(state: FormState): void {
  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
  }, [state]);
}

export function FormCard({
  title,
  description,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-card ring-foreground/10 space-y-4 rounded-xl p-4 ring-1", className)}>
      {title || description ? (
        <div className="space-y-1">
          {title ? <h2 className="font-heading text-base font-semibold">{title}</h2> : null}
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
      ) : null}

      {children}
    </section>
  );
}

export function FormActions({
  pending,
  submitLabel,
  pendingLabel = "Saving…",
  cancelHref,
  cancelLabel = "Cancel",
  extra,
}: {
  pending: boolean;
  submitLabel: string;
  pendingLabel?: string;
  cancelHref?: string;
  cancelLabel?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : null}
        {pending ? pendingLabel : submitLabel}
      </Button>

      {cancelHref ? (
        <Button asChild variant="ghost" size="lg">
          <Link href={cancelHref}>{cancelLabel}</Link>
        </Button>
      ) : null}

      {extra}
    </div>
  );
}

export type SelectFieldOption = { value: string; label: string; disabled?: boolean };

/**
 * A labelled select. Radix renders a hidden native `<select name>` inside a
 * form, so this posts like any other field — no controlled state needed.
 */
export function SelectField({
  label,
  name,
  options,
  defaultValue,
  placeholder = "Select…",
  error,
  hint,
  required,
  disabled,
  className,
}: {
  label: string;
  name: string;
  options: SelectFieldOption[];
  defaultValue?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>

      <Select name={name} defaultValue={defaultValue} required={required} disabled={disabled}>
        <SelectTrigger
          id={name}
          className="h-11 w-full md:h-10"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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

export function TextareaField({
  label,
  name,
  error,
  hint,
  className,
  ...props
}: React.ComponentProps<typeof Textarea> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>

      <Textarea
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
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

/**
 * A checkbox that posts. Radix bubbles a hidden `<input type="checkbox">`, so
 * an unticked box sends nothing at all — which is exactly what the `checkbox`
 * helper in `schemas/common.ts` is written to read.
 */
export function CheckboxField({
  label,
  name,
  description,
  defaultChecked,
  disabled,
  className,
}: {
  label: React.ReactNode;
  name: string;
  description?: React.ReactNode;
  defaultChecked?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <Checkbox
        id={name}
        name={name}
        // Radix restores its *mount-time* `defaultChecked` when React resets the
        // form after an action settles, so a changed default needs a remount.
        key={String(defaultChecked)}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5"
      />

      <div className="grid gap-0.5 leading-tight">
        <Label htmlFor={name} className="font-medium">
          {label}
        </Label>
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Two or three fields sharing a row on desktop, stacked on a phone. */
export function FieldRow({
  children,
  columns = 2,
  className,
}: {
  children: React.ReactNode;
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
