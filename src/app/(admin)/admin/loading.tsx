import { AdminHeaderSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/admin/skeletons";

export default function AdminDashboardLoading() {
  return (
    <div className="space-y-6">
      <AdminHeaderSkeleton />
      <StatGridSkeleton count={8} />
      <TableSkeleton rows={6} columns={6} />
    </div>
  );
}
