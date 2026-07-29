import { AdminHeaderSkeleton, CardListSkeleton } from "@/components/admin/skeletons";

export default function MatchQuestionsLoading() {
  return (
    <div className="space-y-5">
      <AdminHeaderSkeleton withAction />
      <CardListSkeleton count={4} />
    </div>
  );
}
