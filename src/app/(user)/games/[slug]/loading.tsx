import {
  ListSkeleton,
  PageHeaderSkeleton,
  SegmentedNavSkeleton,
} from "@/components/common/skeletons";

export default function CategoryLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeaderSkeleton withBack />
      <SegmentedNavSkeleton items={4} />
      <ListSkeleton count={4} height="h-32" />
    </div>
  );
}
