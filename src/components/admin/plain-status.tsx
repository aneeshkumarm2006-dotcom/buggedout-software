import { StatusChip, type Tone } from "@/components/common/status-badge";
import type { ContentStatus, MatchStatus, QuestionStatus } from "@/lib/enums";
import {
  CONTENT_STATUS_WORDING,
  MATCH_STATUS_WORDING,
  QUESTION_STATUS_WORDING,
} from "@/lib/admin/wording";
import { cn } from "@/lib/utils";

/**
 * Status chips for the admin panel, in plain words.
 *
 * The player site keeps "Upcoming / Live / Settled" — that is the vocabulary
 * somebody placing a bet already has. Staff running the panel do not
 * necessarily, and the difference between `locked` and `resolved` is the
 * difference between "nobody has been paid" and "everybody has", which is worth
 * spelling out. Colours come from the shared chip so the two never disagree.
 *
 * `withMeaning` prints the sentence underneath. Use it on detail screens and
 * queues, not inside a dense table row.
 */
const MATCH_TONE: Record<MatchStatus, { tone: Tone; pulse?: boolean }> = {
  upcoming: { tone: "neutral" },
  live: { tone: "live", pulse: true },
  locked: { tone: "gold" },
  resolved: { tone: "win" },
  cancelled: { tone: "danger" },
};

export function PlainMatchStatus({
  status,
  withMeaning,
  className,
}: {
  status: MatchStatus;
  withMeaning?: boolean;
  className?: string;
}) {
  const { tone, pulse } = MATCH_TONE[status];
  const wording = MATCH_STATUS_WORDING[status];

  return (
    <StatusWithMeaning
      tone={tone}
      pulse={pulse}
      label={wording.label}
      meaning={withMeaning ? wording.meaning : undefined}
      className={className}
    />
  );
}

/**
 * `locked` is gold rather than grey here on purpose: on this side of the app a
 * closed market is not a finished one, it is a job sitting in a queue.
 */
const QUESTION_TONE: Record<QuestionStatus, Tone> = {
  active: "live",
  locked: "gold",
  resolved: "win",
  void: "danger",
};

export function PlainQuestionStatus({
  status,
  withMeaning,
  className,
}: {
  status: QuestionStatus;
  withMeaning?: boolean;
  className?: string;
}) {
  const wording = QUESTION_STATUS_WORDING[status];

  return (
    <StatusWithMeaning
      tone={QUESTION_TONE[status]}
      label={wording.label}
      meaning={withMeaning ? wording.meaning : undefined}
      className={className}
    />
  );
}

export function PlainContentStatus({
  status,
  className,
}: {
  status: ContentStatus;
  className?: string;
}) {
  return (
    <StatusChip tone={status === "active" ? "win" : "muted"} className={className}>
      {CONTENT_STATUS_WORDING[status].label}
    </StatusChip>
  );
}

function StatusWithMeaning({
  tone,
  pulse,
  label,
  meaning,
  className,
}: {
  tone: Tone;
  pulse?: boolean;
  label: string;
  meaning?: string;
  className?: string;
}) {
  if (!meaning) {
    return (
      <StatusChip tone={tone} pulse={pulse} className={className}>
        {label}
      </StatusChip>
    );
  }

  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <StatusChip tone={tone} pulse={pulse}>
        {label}
      </StatusChip>
      <span className="text-muted-foreground text-xs">{meaning}</span>
    </span>
  );
}
