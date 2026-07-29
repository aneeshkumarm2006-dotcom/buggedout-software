import { FormSkeleton, PageHeaderSkeleton } from "@/components/common/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeaderSkeleton />
      <Skeleton className="h-24 w-full rounded-xl lg:hidden" />
      <FormSkeleton fields={2} />
      <FormSkeleton fields={3} />
    </div>
  );
}
