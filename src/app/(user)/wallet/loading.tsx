import { PageHeaderSkeleton, RowsSkeleton } from "@/components/common/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function WalletLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeaderSkeleton />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-6 w-24" />
      <RowsSkeleton count={8} />
    </div>
  );
}
