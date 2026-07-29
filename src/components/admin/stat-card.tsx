import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One figure on the dashboard (Phase 6.2).
 *
 * A card with an `href` is a queue — something waiting to be dealt with — so it
 * gets the affordance of a link. The rest are just numbers.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  emphasis,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  href?: string;
  /** Paints the figure in the accent colour — for a queue with work in it. */
  emphasis?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
        {Icon ? <Icon className="text-muted-foreground/70 size-4 shrink-0" /> : null}
      </div>

      <p
        className={cn(
          "font-heading text-2xl font-bold tabular-nums",
          emphasis && "text-primary",
        )}
      >
        {value}
      </p>

      {hint ? (
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          {hint}
          {href ? <ChevronRightIcon className="size-3" /> : null}
        </p>
      ) : null}
    </>
  );

  const shell = cn(
    "bg-card ring-foreground/10 flex flex-col gap-1 rounded-xl p-4 ring-1",
    href && "hover:bg-card/70 focus-visible:ring-ring/50 transition-colors focus-visible:ring-3 focus-visible:outline-none",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}
