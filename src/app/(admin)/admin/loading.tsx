import { AdminHeaderSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminHomeLoading() {
  return (
    <div className="space-y-6">
      <AdminHeaderSkeleton withAction />

      {/* The task cards are taller than a stat tile — a StatGridSkeleton here
          would collapse the page by a hundred pixels when the query lands. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-36 w-full rounded-xl" />
        ))}
      </div>

      <StatGridSkeleton count={4} />
      <TableSkeleton rows={6} columns={6} />
    </div>
  );
}
