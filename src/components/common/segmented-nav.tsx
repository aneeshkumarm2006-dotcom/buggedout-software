import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The Live/Upcoming and Open/Settled tabs (5.2, 5.6).
 *
 * Links rather than a Radix `Tabs`, because the tab *is* the query: the page is
 * a server component that fetches only the side being looked at, and the choice
 * survives a refresh, a share and the back button. Radix tabs would mean
 * shipping both datasets to the browser and losing all three.
 */
export type SegmentedNavItem = {
  value: string;
  label: React.ReactNode;
  href: string;
  /** Rendered as a pill after the label — a live-match count, say. */
  count?: number;
};

export function SegmentedNav({
  items,
  active,
  className,
  ariaLabel = "Filter",
}: {
  items: SegmentedNavItem[];
  active: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "bg-muted text-muted-foreground inline-flex w-full max-w-md items-center gap-1 rounded-lg p-1 sm:w-fit",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.value === active;

        return (
          <Link
            key={item.value}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            // `scroll={false}`: switching tab shouldn't yank a scrolled list
            // back to the top of the page.
            scroll={false}
            className={cn(
              // 44px on a phone (7.4), back to a desktop-density 36px once
              // there is room for the tabs to sit beside the content.
              "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors sm:h-9 sm:flex-none",
              isActive
                ? "bg-background text-foreground ring-primary/20 shadow-sm ring-1 ring-inset"
                : "hover:text-foreground",
            )}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  isActive ? "bg-primary/15 text-primary" : "bg-foreground/10",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
