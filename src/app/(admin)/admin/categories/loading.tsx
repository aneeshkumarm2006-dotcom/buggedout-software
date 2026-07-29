import { AdminListSkeleton } from "@/components/admin/skeletons";

export default function CategoriesLoading() {
  return <AdminListSkeleton filters={1} columns={7} withAction />;
}
