import { ListSkeleton, PageHeaderSkeleton } from "@/components/common/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function MatchLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeaderSkeleton withBack />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-6 w-28" />
      <ListSkeleton count={3} height="h-36" />
    </div>
  );
}
