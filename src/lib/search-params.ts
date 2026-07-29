/**
 * Query-string parsing for the paginated user pages (5.6, 5.7, 5.10).
 *
 * A search param is user input like any other: `?page=abc`, `?page=-3` and
 * `?page=1e9` all arrive here and all have to mean something sane rather than
 * reaching Mongo as a `skip` value.
 */

/** Upper bound on `skip` — past this a page number is a scraper, not a reader. */
const MAX_PAGE = 10_000;

export function parsePageParam(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_PAGE);
}
