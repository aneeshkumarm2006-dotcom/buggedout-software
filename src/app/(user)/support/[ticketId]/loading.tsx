import { PageHeaderSkeleton } from "@/components/common/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function TicketLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeaderSkeleton withBack />

      <div className="space-y-3">
        <Skeleton className="h-20 w-4/5 rounded-xl" />
        <Skeleton className="ml-auto h-16 w-3/5 rounded-xl" />
        <Skeleton className="h-24 w-4/5 rounded-xl" />
      </div>

      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
