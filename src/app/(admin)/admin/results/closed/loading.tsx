import { AdminListSkeleton } from "@/components/admin/skeletons";

export default function ClosedResultsLoading() {
  return <AdminListSkeleton filters={2} columns={8} />;
}
