import { AdminListSkeleton } from "@/components/admin/skeletons";

export default function TeamsLoading() {
  return <AdminListSkeleton filters={2} columns={5} withAction />;
}
