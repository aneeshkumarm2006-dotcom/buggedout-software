import { AdminHeaderSkeleton, CardListSkeleton, ToolbarSkeleton } from "@/components/admin/skeletons";
import { SegmentedNavSkeleton } from "@/components/common/skeletons";

export default function SupportLoading() {
  return (
    <div className="space-y-5">
      <AdminHeaderSkeleton />
      <SegmentedNavSkeleton items={5} />
      <ToolbarSkeleton filters={0} />
      <CardListSkeleton count={5} />
    </div>
  );
}
