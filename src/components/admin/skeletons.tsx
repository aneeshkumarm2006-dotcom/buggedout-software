import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shapes every admin `loading.tsx` is built from (Phase 6.1).
 *
 * Each mirrors the layout it stands in for — same toolbar height, same number
 * of columns — so a page doesn't jump when its query lands. Admin lists are
 * server-rendered, and on a slow query that gap is real.
 */
export function AdminHeaderSkeleton({ withAction }: { withAction?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {withAction ? <Skeleton className="h-9 w-32" /> : null}
    </div>
  );
}

export function ToolbarSkeleton({ filters = 1 }: { filters?: number }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Skeleton className="h-9 w-full max-w-xs" />
      {Array.from({ length: filters }, (_, index) => (
        <Skeleton key={index} className="h-9 w-36" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl ring-1">
      <div className="flex items-center gap-4 border-b px-4 py-2.5">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-4 flex-1" />
        ))}
      </div>

      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-32 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function AdminFormSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="grid max-w-3xl gap-4">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="bg-card ring-foreground/10 space-y-4 rounded-xl p-4 ring-1">
          <Skeleton className="h-5 w-32" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-11 w-full md:h-10" />
            <Skeleton className="h-11 w-full md:h-10" />
          </div>
          <Skeleton className="h-11 w-full md:h-10" />
        </div>
      ))}
      <Skeleton className="h-9 w-32" />
    </div>
  );
}

/** The whole of a standard list page: header, toolbar, table. */
export function AdminListSkeleton({
  filters = 1,
  columns = 5,
  rows = 8,
  withAction,
}: {
  filters?: number;
  columns?: number;
  rows?: number;
  withAction?: boolean;
}) {
  return (
    <div className="space-y-5">
      <AdminHeaderSkeleton withAction={withAction} />
      <ToolbarSkeleton filters={filters} />
      <TableSkeleton rows={rows} columns={columns} />
    </div>
  );
}
