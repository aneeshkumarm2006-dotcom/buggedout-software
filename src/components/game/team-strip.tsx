import { AssetImage } from "@/components/common/asset-image";
import { TEAM_IMAGE_SIZE } from "@/lib/enums";
import type { TeamRef } from "@/lib/matches";
import { cn } from "@/lib/utils";

/**
 * The line-up on a match card or a match header (5.3, 5.4).
 *
 * A match carries anywhere from 2 to 8 teams, so this is a wrapping row rather
 * than the "A vs B" split a two-sided sport would use — eight lanes have to fit
 * on a 375px screen without a horizontal scrollbar.
 */
export function TeamStrip({
  teams,
  size = "sm",
  className,
}: {
  teams: TeamRef[];
  size?: "sm" | "lg";
  className?: string;
}) {
  if (teams.length === 0) return null;

  const crest = size === "lg" ? "size-10" : "size-7";

  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      {teams.map((team) => (
        <li key={team.id} className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "bg-muted relative shrink-0 overflow-hidden rounded-full",
              crest,
            )}
          >
            <AssetImage
              src={team.image}
              alt=""
              width={TEAM_IMAGE_SIZE}
              height={TEAM_IMAGE_SIZE}
              className="size-full object-cover"
            />
          </span>

          <span
            className={cn(
              "truncate",
              size === "lg" ? "text-sm font-medium" : "text-muted-foreground text-xs",
            )}
          >
            {team.name}
          </span>
        </li>
      ))}
    </ul>
  );
}
