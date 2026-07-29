import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The building blocks every `loading.tsx` in the user site is made of (5.12).
 *
 * Each one mirrors the real layout it stands in for — same card shape, same
 * row height, same grid — so the page doesn't jump when the data lands. A
 * generic spinner would be less work and considerably worse on a phone.
 */
export function PageHeaderSkeleton({ withBack }: { withBack?: boolean }) {
  return (
    <div className="space-y-2">
      {withBack ? <Skeleton className="h-4 w-24" /> : null}
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-64 max-w-full" />
    </div>
  );
}

export function SegmentedNavSkeleton({ items = 2 }: { items?: number }) {
  return (
    <div className="bg-muted flex w-full max-w-md gap-1 rounded-lg p-1 sm:w-fit">
      {Array.from({ length: items }, (_, index) => (
        <Skeleton key={index} className="h-9 flex-1 sm:w-24" />
      ))}
    </div>
  );
}

/** The lobby's game tiles. */
export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="bg-card ring-foreground/10 overflow-hidden rounded-xl ring-1">
          <Skeleton className="aspect-4/3 w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Match cards, bet rows, ticket rows — anything that is a stack of cards. */
export function ListSkeleton({
  count = 5,
  height = "h-24",
  className,
}: {
  count?: number;
  height?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2.5", className)}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={cn("w-full rounded-xl", height)} />
      ))}
    </div>
  );
}

/** The wallet ledger and the ticket list: one bordered card, many rows. */
export function RowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="divide-border bg-card ring-foreground/10 divide-y overflow-hidden rounded-xl ring-1">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <Skeleton className="h-8 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** A form card: heading plus a few labelled inputs. */
export function FormSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <div className="bg-card ring-foreground/10 space-y-4 rounded-xl px-5 py-4 ring-1">
      <Skeleton className="h-5 w-32" />
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-11 w-full md:h-10" />
        </div>
      ))}
      <Skeleton className="h-11 w-full md:h-10" />
    </div>
  );
}
