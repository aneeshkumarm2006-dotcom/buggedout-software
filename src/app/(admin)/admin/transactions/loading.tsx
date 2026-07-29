import {
  AdminHeaderSkeleton,
  StatGridSkeleton,
  TableSkeleton,
  ToolbarSkeleton,
} from "@/components/admin/skeletons";

export default function TransactionsLoading() {
  return (
    <div className="space-y-5">
      <AdminHeaderSkeleton />
      <ToolbarSkeleton />
      <StatGridSkeleton count={3} />
      <TableSkeleton rows={8} columns={6} />
    </div>
  );
}
