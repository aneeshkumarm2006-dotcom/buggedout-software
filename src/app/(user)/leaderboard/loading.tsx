import { PageHeaderSkeleton } from "@/components/common/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function LeaderboardLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeaderSkeleton />

      <div className="space-y-2">
        <Skeleton className="h-8 w-full max-w-sm rounded-full" />
        <Skeleton className="h-8 w-full max-w-md rounded-full" />
      </div>

      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
