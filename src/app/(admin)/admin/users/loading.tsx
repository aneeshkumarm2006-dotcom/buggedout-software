import { AdminListSkeleton } from "@/components/admin/skeletons";

export default function UsersLoading() {
  return <AdminListSkeleton filters={2} columns={6} />;
}
