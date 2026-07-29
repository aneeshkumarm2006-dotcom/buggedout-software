import {
  CardGridSkeleton,
  PageHeaderSkeleton,
  SegmentedNavSkeleton,
} from "@/components/common/skeletons";

/**
 * Lobby skeleton (5.12). Also the fallback for any segment below `(user)` that
 * hasn't declared its own — the shell (nav, balance, bet slip) stays put while
 * this stands in for the page.
 */
export default function LobbyLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <PageHeaderSkeleton />
      <SegmentedNavSkeleton />
      <CardGridSkeleton count={10} />
    </div>
  );
}
