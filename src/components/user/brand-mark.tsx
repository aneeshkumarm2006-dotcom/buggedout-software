import Image from "next/image";
import Link from "next/link";

import { siteAsset } from "@/lib/site-assets";
import { cn } from "@/lib/utils";

/**
 * Wordmark + home link (8.1). One component, so the header, the sidebar and
 * anywhere else the mark turns up stay the same mark.
 *
 * `letter-logo.webp` is the delivered logotype trimmed to its glyph bounds, so
 * the box this renders is the type and nothing else — a height and `w-auto` are
 * enough to place it. It carries the brand name as its `alt`, which is what a
 * screen reader should read here; the link's own label is on the anchor.
 */
export function BrandMark({
  className,
  eager,
}: {
  className?: string;
  /**
   * The header mark is above the fold on every page. `loading`/`fetchPriority`
   * rather than the `priority` prop, which Next 16 deprecated into a no-op (9.5).
   */
  eager?: boolean;
}) {
  return (
    <Link
      href="/"
      aria-label="BuggedOut — home"
      className={cn("touch-target inline-flex items-center", className)}
    >
      <Image
        src={siteAsset("letterLogo")}
        alt="BuggedOut"
        width={900}
        height={146}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        sizes="180px"
        className="h-5 w-auto"
      />
    </Link>
  );
}
