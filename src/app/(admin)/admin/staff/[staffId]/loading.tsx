import { AdminFormSkeleton, AdminHeaderSkeleton } from "@/components/admin/skeletons";

export default function FormLoading() {
  return (
    <div className="space-y-5">
      <AdminHeaderSkeleton />
      <AdminFormSkeleton cards={2} />
    </div>
  );
}
