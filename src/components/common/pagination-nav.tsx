import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Prev/next for the server-paginated lists (wallet ledger, My Bets, tickets).
 *
 * Page number lives in the URL, so a deep-linked page 3 renders page 3 on the
 * server — no client state to lose on refresh. Rendering nothing for a single
 * page keeps short lists from growing a control that can't do anything.
 */
export function PaginationNav({
  page,
  totalPages,
  totalItems,
  buildHref,
  itemLabel = "items",
  className,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  /** Given a page number, returns the URL for it — the caller owns the rest of the query. */
  buildHref: (page: number) => string;
  itemLabel?: string;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <p className="text-muted-foreground text-xs">
        Page <span className="text-foreground font-medium tabular-nums">{page}</span> of{" "}
        <span className="tabular-nums">{totalPages}</span>
        <span className="hidden sm:inline">
          {" "}
          · {totalItems.toLocaleString("en-US")} {itemLabel}
        </span>
      </p>

      <div className="flex items-center gap-2">
        <Button
          asChild={hasPrevious}
          variant="outline"
          size="lg"
          disabled={!hasPrevious}
          aria-disabled={!hasPrevious}
        >
          {hasPrevious ? (
            <Link href={buildHref(page - 1)} scroll={false} rel="prev">
              <ChevronLeftIcon />
              Newer
            </Link>
          ) : (
            <>
              <ChevronLeftIcon />
              Newer
            </>
          )}
        </Button>

        <Button
          asChild={hasNext}
          variant="outline"
          size="lg"
          disabled={!hasNext}
          aria-disabled={!hasNext}
        >
          {hasNext ? (
            <Link href={buildHref(page + 1)} scroll={false} rel="next">
              Older
              <ChevronRightIcon />
            </Link>
          ) : (
            <>
              Older
              <ChevronRightIcon />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
