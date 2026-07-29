/**
 * Display formatting shared by server and client components (Phase 5).
 *
 * Deliberately free of `server-only`: the bet slip, the countdown and the
 * balance pill all need these in the browser bundle.
 *
 * Every formatter names its locale explicitly. A bare `toLocaleString()`
 * resolves against the *server's* locale during SSR and the *browser's* on
 * hydration, which is exactly the difference React reports as a mismatch.
 */

const LOCALE = "en-US";

const coinFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** `1234` → `1,234`. Coins are always whole numbers. */
export function formatCoins(amount: number): string {
  return coinFormatter.format(Math.round(amount));
}

/** Ledger rows show their direction: `+100`, `−250`. */
export function formatSignedCoins(amount: number): string {
  const rounded = Math.round(amount);
  // U+2212, not a hyphen — it lines up with digits in a tabular-nums column.
  return rounded < 0 ? `−${coinFormatter.format(Math.abs(rounded))}` : `+${coinFormatter.format(rounded)}`;
}

const ratioFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

/** Odds always carry a decimal, so `2` reads as `2.0` rather than a quantity. */
export function formatRatio(ratio: number): string {
  return ratioFormatter.format(ratio);
}

export function formatPercent(value: number): string {
  return `${ratioFormatter.format(value)}%`;
}

export type TimeFormat = "datetime" | "date" | "time" | "short";

/**
 * A fixed-offset formatter, used for the first paint. `timeZone: "UTC"` makes
 * the server and the client agree on the initial HTML; `<LocalTime>` swaps in
 * the viewer's own zone once it has mounted.
 */
export function formatInstant(
  value: string | number | Date,
  format: TimeFormat = "datetime",
  timeZone?: string,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(LOCALE, { ...TIME_FORMATS[format], timeZone }).format(date);
}

const TIME_FORMATS: Record<TimeFormat, Intl.DateTimeFormatOptions> = {
  datetime: { dateStyle: "medium", timeStyle: "short" },
  date: { dateStyle: "medium" },
  time: { timeStyle: "short" },
  short: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
};

/**
 * Coarse "how long until / since", used by the countdown and the match cards.
 * Days and hours only past a day, then minutes, then seconds — a market closing
 * in three days doesn't need its seconds ticking.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));

  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

/** `2 hours ago`, `in 3 days` — relative to now, for ledger rows and tickets. */
export function formatRelative(value: string | number | Date, now: number = Date.now()): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "—";

  const deltaSeconds = Math.round((time - now) / 1000);
  const absolute = Math.abs(deltaSeconds);

  const [unit, perUnit]: [Intl.RelativeTimeFormatUnit, number] =
    absolute < 60
      ? ["second", 1]
      : absolute < 3_600
        ? ["minute", 60]
        : absolute < 86_400
          ? ["hour", 3_600]
          : absolute < 2_592_000
            ? ["day", 86_400]
            : absolute < 31_536_000
              ? ["month", 2_592_000]
              : ["year", 31_536_000];

  return relativeFormatter.format(Math.round(deltaSeconds / perUnit), unit);
}

const relativeFormatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

/** First letter of each word, for the avatar fallback. */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";

  const letters = name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  return letters || name[0]!.toUpperCase();
}
