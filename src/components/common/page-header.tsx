import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Title block every user page opens with. `backHref` renders the back affordance
 * a phone needs on a detail screen — an explicit link rather than `router.back()`,
 * which would strand anyone who arrived from a shared URL.
 */
export function PageHeader({
  title,
  description,
  backHref,
  backLabel = "Back",
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="size-4" />
          {backLabel}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {description ? (
            <div className="text-muted-foreground text-sm">{description}</div>
          ) : null}
        </div>

        {action}
      </div>
    </div>
  );
}
