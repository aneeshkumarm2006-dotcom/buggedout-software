"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

/**
 * A date/time input that submits an unambiguous instant (Phase 6.5–6.8).
 *
 * `<input type="datetime-local">` posts a bare wall clock — `2026-07-28T15:00`
 * — which `new Date()` reads in whatever timezone happens to be running it. On
 * a Vercel box that is UTC, on the admin's laptop it is not, and a match would
 * quietly start at the wrong time. So the visible input is only ever a display:
 * the value that actually reaches the server is the ISO string in the hidden
 * field beside it.
 *
 * The first render (server and hydration alike) shows UTC, because that is the
 * only zone both ends agree on; `useHydrated` then swaps in the viewer's own,
 * the same trick `<LocalTime>` uses.
 */
export function DateTimeField({
  label,
  name,
  defaultValue,
  value,
  onValueChange,
  error,
  hint,
  required,
  mode = "datetime",
  className,
}: {
  label: string;
  name: string;
  /** ISO 8601, or empty for a blank field. */
  defaultValue?: string | null;
  /**
   * Pass this to drive the field from outside. The forms that post through
   * `FormData` leave it undefined and let the hidden input below do the work;
   * the guided builder holds the whole event in its own state and needs the
   * value back — and needs "in 1 hour" to be able to write into the field.
   */
  value?: string | null;
  onValueChange?: (iso: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  mode?: "datetime" | "date";
  className?: string;
}) {
  const hydrated = useHydrated();
  const [internal, setInternal] = useState(defaultValue ?? "");

  const controlled = value !== undefined;
  const iso = controlled ? (value ?? "") : internal;

  function setIso(next: string) {
    if (!controlled) setInternal(next);
    onValueChange?.(next);
  }

  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  const display = isoToWallClock(iso, mode, hydrated);
  const zone = hydrated ? resolvedTimeZone() : "UTC";

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={`${name}-input`}>{label}</Label>

      {/* The real payload: an instant, not a wall clock. */}
      <input type="hidden" name={name} value={iso} />

      <Input
        id={`${name}-input`}
        type={mode === "date" ? "date" : "datetime-local"}
        value={display}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hintId}
        onChange={(event) => setIso(wallClockToIso(event.target.value, mode))}
        className="h-11 md:h-10"
        // The value differs between the server's UTC render and the first
        // client render in the viewer's zone — that swap is the whole point.
        suppressHydrationWarning
      />

      {error ? (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      ) : (
        <p id={hintId} className="text-muted-foreground text-xs" suppressHydrationWarning>
          {hint ? `${hint} · ` : ""}
          {zone}
        </p>
      )}
    </div>
  );
}

/** ISO → what the input shows. Before hydration that has to be UTC. */
function isoToWallClock(iso: string, mode: "datetime" | "date", local: boolean): string {
  if (!iso) return "";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  if (!local) {
    // `toISOString()` is already `YYYY-MM-DDTHH:mm:ss.sssZ` in UTC.
    return mode === "date" ? date.toISOString().slice(0, 10) : date.toISOString().slice(0, 16);
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  return mode === "date" ? day : `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * What the input shows → ISO. Only ever runs in the browser (there is no change
 * event on the server), so the bare string is correctly read as local time.
 */
function wallClockToIso(value: string, mode: "datetime" | "date"): string {
  if (!value) return "";

  // A bare `YYYY-MM-DD` is parsed as UTC midnight, unlike a date-time — adding
  // the time makes both forms local, which is what the admin typed.
  const date = new Date(mode === "date" ? `${value}T00:00` : value);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function resolvedTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
