import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";

import { siteAsset, type SiteAssetName } from "@/lib/site-assets";
import { cn } from "@/lib/utils";

/**
 * The four neon line icons in the brand delivery, and where each one belongs
 * (8.4). Named rather than passed as raw paths so a renamed file is a type
 * error here instead of a silently broken image on a screen nobody visits
 * often — an empty state is, by definition, the rare case. `satisfies` is what
 * keeps that true now the paths themselves live in `site-assets.ts`.
 */
export const EMPTY_ART = {
  games: "icons/tv",
  bets: "icons/clipboard",
  leaderboard: "icons/trophy",
  referrals: "icons/crown",
} as const satisfies Record<string, SiteAssetName>;

/**
 * The "No data" state every list in Phase 5 falls back to (5.12).
 *
 * One component rather than a bespoke message per page, so an empty wallet and
 * an empty leaderboard read as the same deliberate state instead of looking
 * like two different things went wrong.
 *
 * `art` upgrades the glyph to one of the brand icons on the handful of screens
 * that have one; everything else keeps the Lucide fallback, which is the point
 * of having a fallback.
 */
export function EmptyState({
  icon: Icon = InboxIcon,
  art,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  art?: (typeof EMPTY_ART)[keyof typeof EMPTY_ART];
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      {art ? (
        // Already a line drawing on nothing, so it needs no plate behind it —
        // and it carries its own brand colour, which the Lucide glyph does not.
        <Image
          src={siteAsset(art)}
          alt=""
          width={256}
          height={256}
          className="size-16 opacity-90"
        />
      ) : (
        <span className="bg-muted/60 text-muted-foreground flex size-11 items-center justify-center rounded-full">
          <Icon className="size-5" />
        </span>
      )}

      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-xs text-sm text-balance">
            {description}
          </p>
        ) : null}
      </div>

      {action}
    </div>
  );
}
