import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClockIcon } from "lucide-react";

import { AssetImage } from "@/components/common/asset-image";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SegmentedNav } from "@/components/common/segmented-nav";
import { MatchCard } from "@/components/game/match-card";
import {
  getCategoryBySlug,
  getCategoryMatches,
  parseMatchFilter,
  type MatchFilter,
} from "@/lib/matches";

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filter?: string }>;
};

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  return { title: category?.title ?? "Game" };
}

/**
 * A game's schedule (Phase 5.3) — its matches with teams, start time, countdown
 * and status.
 *
 * The filter is a query param for the same reason the lobby's tab is: the
 * server fetches only the slice being shown, and the choice survives a refresh.
 */
export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ slug }, { filter: requestedFilter }] = await Promise.all([params, searchParams]);

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const filter = parseMatchFilter(requestedFilter);
  const { matches, counts } = await getCategoryMatches(category.id, filter);

  const href = (value: MatchFilter) =>
    value === "all" ? `/games/${category.slug}` : `/games/${category.slug}?filter=${value}`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader
        backHref="/"
        backLabel="All games"
        title={
          <span className="flex items-center gap-3">
            <span className="bg-muted relative size-10 shrink-0 overflow-hidden rounded-lg">
              <AssetImage
                src={category.cardImage}
                alt=""
                fill
                sizes="40px"
                className="size-full object-cover"
              />
            </span>
            {category.title}
          </span>
        }
        description={
          counts.all === 0
            ? "No matches scheduled yet."
            : `${counts.all} match${counts.all === 1 ? "" : "es"} scheduled`
        }
      />

      <SegmentedNav
        ariaLabel="Match status"
        active={filter}
        items={[
          { value: "all", label: "All", href: href("all") },
          { value: "live", label: "Live", href: href("live"), count: counts.live },
          { value: "upcoming", label: "Upcoming", href: href("upcoming"), count: counts.upcoming },
          { value: "finished", label: "Finished", href: href("finished") },
        ]}
      />

      {matches.length === 0 ? (
        <EmptyState
          icon={CalendarClockIcon}
          title={filter === "all" ? "No matches yet" : `No ${filter} matches`}
          description={
            filter === "all"
              ? "Nothing has been scheduled for this game. It'll show up here as soon as it is."
              : "Try another filter — there may be matches under a different status."
          }
        />
      ) : (
        <ul className="grid gap-2.5">
          {matches.map((match) => (
            <li key={match.id}>
              <MatchCard match={match} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
