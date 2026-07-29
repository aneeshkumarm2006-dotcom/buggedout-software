import { FormSkeleton, ListSkeleton, PageHeaderSkeleton } from "@/components/common/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function SupportLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeaderSkeleton />
      <Skeleton className="h-6 w-32" />
      <ListSkeleton count={3} height="h-24" />
      <FormSkeleton fields={2} />
    </div>
  );
}
