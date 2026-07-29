import { AdminListSkeleton } from "@/components/admin/skeletons";

export default function MatchesLoading() {
  return <AdminListSkeleton filters={3} columns={6} withAction />;
}
