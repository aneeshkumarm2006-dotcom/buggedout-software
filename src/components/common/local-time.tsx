"use client";

import { formatInstant, type TimeFormat } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * A timestamp shown in the *viewer's* timezone.
 *
 * The server has no idea what that is, so the markup it sends is UTC —
 * identical on both sides, which is what keeps hydration quiet — and the
 * viewer's own zone takes over on the first client render. Formatting locally
 * straight away is not an option: it would differ from the server's HTML for
 * every user outside UTC.
 */
export function LocalTime({
  value,
  format = "datetime",
  className,
}: {
  /** ISO 8601 — DTOs cross the server/client boundary as strings. */
  value: string;
  format?: TimeFormat;
  className?: string;
}) {
  const hydrated = useHydrated();

  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {formatInstant(value, format, hydrated ? undefined : "UTC")}
    </time>
  );
}
