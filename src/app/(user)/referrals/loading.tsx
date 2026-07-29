import { PageHeaderSkeleton, RowsSkeleton } from "@/components/common/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReferralsLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeaderSkeleton />
      <Skeleton className="h-44 w-full rounded-xl" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="col-span-2 h-20 rounded-xl sm:col-span-1" />
      </div>

      <RowsSkeleton count={3} />
    </div>
  );
}
