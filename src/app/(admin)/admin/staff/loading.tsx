import { AdminListSkeleton } from "@/components/admin/skeletons";

export default function StaffLoading() {
  return <AdminListSkeleton filters={1} columns={6} withAction />;
}
