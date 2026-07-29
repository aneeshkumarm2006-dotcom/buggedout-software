import { AdminHeaderSkeleton, CardListSkeleton, ToolbarSkeleton } from "@/components/admin/skeletons";

export default function PendingResultsLoading() {
  return (
    <div className="space-y-5">
      <AdminHeaderSkeleton />
      <ToolbarSkeleton />
      <CardListSkeleton count={4} />
    </div>
  );
}
