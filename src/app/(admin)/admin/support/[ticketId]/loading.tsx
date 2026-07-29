import { AdminFormSkeleton, AdminHeaderSkeleton, CardListSkeleton } from "@/components/admin/skeletons";

export default function TicketLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <AdminHeaderSkeleton withAction />
      <CardListSkeleton count={3} />
      <AdminFormSkeleton cards={1} />
    </div>
  );
}
