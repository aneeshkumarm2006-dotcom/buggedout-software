/**
 * Query-string plumbing for the admin tables (Phase 6.1) — every list gets
 * search, filters and pagination, and they all read them the same way.
 *
 * Deliberately free of `server-only`: the toolbar is a client component and
 * builds its hrefs with `buildAdminHref` so a filter change and a page change
 * produce exactly the same URL shape.
 */

/** The shape Next hands a page as `searchParams`. */
export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export const ADMIN_PAGE_SIZE = 20;

/** Past this a page number is a scraper, not a reader (same bound as the user site). */
const MAX_PAGE = 10_000;

const MAX_SEARCH_LENGTH = 120;

export type Paged<T> = {
  rows: T[];
  page: number;
  totalPages: number;
  total: number;
};

/** A repeated param (`?status=a&status=b`) collapses to the first value. */
export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePage(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(first(value) ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_PAGE);
}

export function parseSearch(value: string | string[] | undefined): string {
  return (first(value) ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
}

/** A filter whose value must be one of a known set; anything else means "unset". */
export function parseFilter<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T | undefined {
  const raw = first(value);
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

/** Same, but with a default — for filters that are always one of N (tabs). */
export function parseFilterWithDefault<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return parseFilter(value, allowed) ?? fallback;
}

/** An id filter arriving from a `<select>`; rejected unless it looks like an ObjectId. */
export function parseIdFilter(value: string | string[] | undefined): string | undefined {
  const raw = first(value);
  return raw && /^[0-9a-fA-F]{24}$/.test(raw) ? raw : undefined;
}

/** `?from=2026-07-01` — a bare date, or nothing. */
export function parseDateFilter(value: string | string[] | undefined): Date | undefined {
  const raw = first(value);
  if (!raw) return undefined;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * A one-shot message carried across the redirect that follows a create
 * (`?flash=Game+created.`). Plain text, capped, rendered by sonner as a string
 * — there is no markup path here for it to reach.
 */
export function parseFlash(value: string | string[] | undefined): string | undefined {
  return (first(value) ?? "").trim().slice(0, 160) || undefined;
}

export function pageSlice(page: number, limit: number = ADMIN_PAGE_SIZE) {
  return { skip: (page - 1) * limit, limit };
}

export function totalPages(total: number, limit: number = ADMIN_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / limit));
}

/**
 * A user-supplied search term as a `$regex`.
 *
 * The escaping is not optional: `q=(a+)+$` reaching Mongo unescaped is a
 * denial-of-service, not a search.
 */
export function searchRegex(term: string): RegExp {
  return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

export type HrefParams = Record<string, string | number | null | undefined>;

/**
 * Builds a list URL, dropping anything empty so the address bar stays readable
 * — `/admin/users` rather than `/admin/users?q=&role=&page=1`.
 */
export function buildAdminHref(pathname: string, params: HrefParams): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    // Page 1 is the default; spelling it out just makes the URL longer.
    if (key === "page" && Number(value) <= 1) continue;
    query.set(key, String(value));
  }

  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/** Keeps every current filter and swaps one value — what the toolbar does on change. */
export function withParam(
  pathname: string,
  current: HrefParams,
  key: string,
  value: string | number | null | undefined,
): string {
  // Any filter change puts you back on page 1; page 7 of the old result set is
  // meaningless against the new one.
  return buildAdminHref(pathname, { ...current, [key]: value, page: undefined });
}
