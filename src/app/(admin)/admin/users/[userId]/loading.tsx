import {
  AdminFormSkeleton,
  AdminHeaderSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from "@/components/admin/skeletons";

export default function UserDetailLoading() {
  return (
    <div className="space-y-6">
      <AdminHeaderSkeleton withAction />
      <StatGridSkeleton count={5} />
      <AdminFormSkeleton cards={2} />
      <TableSkeleton rows={5} columns={5} />
    </div>
  );
}
