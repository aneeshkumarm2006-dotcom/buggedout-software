import { AdminFormSkeleton, AdminHeaderSkeleton } from "@/components/admin/skeletons";

export default function SetUpEventLoading() {
  return (
    <div className="space-y-5">
      <AdminHeaderSkeleton withAction />
      <AdminFormSkeleton cards={2} />
    </div>
  );
}
