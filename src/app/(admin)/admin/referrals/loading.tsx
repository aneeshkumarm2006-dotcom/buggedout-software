import {
  AdminFormSkeleton,
  AdminHeaderSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from "@/components/admin/skeletons";

export default function ReferralsLoading() {
  return (
    <div className="space-y-6">
      <AdminHeaderSkeleton />
      <StatGridSkeleton />
      <AdminFormSkeleton cards={3} />
      <TableSkeleton rows={6} columns={5} />
    </div>
  );
}
