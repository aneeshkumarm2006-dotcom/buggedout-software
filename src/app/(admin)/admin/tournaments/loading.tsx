import { AdminListSkeleton } from "@/components/admin/skeletons";

export default function TournamentsLoading() {
  return <AdminListSkeleton filters={2} columns={6} withAction />;
}
