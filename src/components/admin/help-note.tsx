import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRightIcon, InfoIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The two things a panel needs if the person using it was not the person who
 * built it: a sentence saying what a screen is for, and a button saying what to
 * do next.
 *
 * `HelpNote` is the sentence. It is deliberately quiet — an admin who already
 * knows the screen should be able to look past it, which rules out an alert
 * banner. Anything genuinely dangerous still gets a confirm dialog; this is not
 * a warning component.
 */
export function HelpNote({
  title,
  children,
  steps,
  className,
}: {
  title?: string;
  children?: React.ReactNode;
  /** Numbered when order matters — a job with three stages, not three tips. */
  steps?: React.ReactNode[];
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "bg-muted/40 ring-foreground/10 flex gap-3 rounded-xl p-4 ring-1",
        className,
      )}
    >
      <InfoIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />

      <div className="min-w-0 space-y-2 text-sm">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-muted-foreground space-y-1.5">{children}</div> : null}

        {steps?.length ? (
          <ol className="text-muted-foreground space-y-1.5">
            {steps.map((step, index) => (
              <li key={index} className="flex gap-2.5">
                <span className="bg-background ring-foreground/10 text-foreground mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">{step}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * `TaskCard` is the button. The home screen is built out of these rather than
 * out of statistics, because "what do I do now" is the question somebody opens
 * an admin panel with, and a grid of numbers does not answer it.
 *
 * `waiting` turns the card into a queue: the count moves to the front and the
 * whole card takes the accent, which is the only thing on the screen that does.
 */
export function TaskCard({
  href,
  title,
  description,
  icon: Icon,
  waiting,
  waitingLabel,
  primary,
  className,
}: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** How many things are sitting in this queue. `0` renders as "nothing waiting". */
  waiting?: number;
  waitingLabel?: string;
  /** The one action this screen most wants pressed. */
  primary?: boolean;
  className?: string;
}) {
  const busy = (waiting ?? 0) > 0;

  return (
    <Link
      href={href}
      className={cn(
        "group ring-foreground/10 focus-visible:ring-ring/50 flex flex-col gap-2 rounded-xl p-4 ring-1 transition-colors focus-visible:ring-3 focus-visible:outline-none",
        primary
          ? "bg-primary/10 ring-primary/30 hover:bg-primary/15"
          : busy
            ? "bg-brand-gold/10 ring-brand-gold/30 hover:bg-brand-gold/15"
            : "bg-card hover:bg-card/70",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <Icon
          className={cn(
            "size-5 shrink-0",
            primary ? "text-primary" : busy ? "text-brand-gold" : "text-muted-foreground",
          )}
        />

        <p className="font-heading flex-1 text-base font-semibold">{title}</p>

        {waiting !== undefined ? (
          <span
            className={cn(
              "font-heading rounded-full px-2 py-0.5 text-sm font-bold tabular-nums",
              busy ? "bg-brand-gold/20 text-brand-gold" : "text-muted-foreground",
            )}
          >
            {waiting}
          </span>
        ) : null}
      </div>

      <p className="text-muted-foreground text-sm">
        {waiting !== undefined && waitingLabel
          ? busy
            ? waitingLabel
            : description
          : description}
      </p>

      <span
        className={cn(
          "mt-auto inline-flex items-center gap-1 pt-1 text-sm font-medium",
          primary ? "text-primary" : busy ? "text-brand-gold" : "text-muted-foreground",
        )}
      >
        Open
        <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
