import {
  ListSkeleton,
  PageHeaderSkeleton,
  SegmentedNavSkeleton,
} from "@/components/common/skeletons";

export default function MyBetsLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeaderSkeleton />
      <SegmentedNavSkeleton />
      <ListSkeleton count={5} height="h-36" />
    </div>
  );
}
