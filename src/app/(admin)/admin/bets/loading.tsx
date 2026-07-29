import {
  AdminHeaderSkeleton,
  StatGridSkeleton,
  TableSkeleton,
  ToolbarSkeleton,
} from "@/components/admin/skeletons";

export default function BetsLoading() {
  return (
    <div className="space-y-5">
      <AdminHeaderSkeleton />
      <ToolbarSkeleton filters={2} />
      <StatGridSkeleton count={3} />
      <TableSkeleton rows={8} columns={8} />
    </div>
  );
}
