import { Badge } from "@/components/ui/badge";
import type { BetStatus, MatchStatus, QuestionStatus, SupportTicketStatus } from "@/lib/enums";
import { cn } from "@/lib/utils";

/**
 * Status chips for matches, markets, bets and tickets (5.3, 5.4, 5.6, 5.10).
 *
 * Everything paints with theme tokens rather than literal colours, so the
 * palette stays in one file. Phase 7.3 split the accent in two: `--live` (the
 * HUD cyan) marks something happening right now, `--win` (the neon green) marks
 * money. They used to be the same token, which made "this market is open" and
 * "this bet paid" look identical on a list holding both.
 *
 * Set small, uppercase and letterspaced — chips are labels, not sentences, and
 * at 10px that reads as deliberate rather than as shrunken body text.
 */
type Tone = "win" | "live" | "gold" | "neutral" | "muted" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  win: "bg-win/12 text-win ring-win/25",
  live: "bg-live/12 text-live ring-live/25",
  gold: "bg-brand-gold/12 text-brand-gold ring-brand-gold/25",
  neutral: "bg-secondary text-secondary-foreground ring-border",
  muted: "bg-muted/60 text-muted-foreground ring-border",
  danger: "bg-destructive/12 text-destructive ring-destructive/25",
};

function StatusChip({
  tone,
  children,
  pulse,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  /** The dot that marks a market as running right now. */
  pulse?: boolean;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1.5 px-2 text-[10px] font-semibold tracking-[0.08em] uppercase ring-1 ring-inset",
        TONE_CLASS[tone],
        className,
      )}
    >
      {pulse ? (
        <span className="relative flex size-1.5">
          <span className="bg-live absolute inline-flex size-full animate-ping rounded-full opacity-75" />
          <span className="bg-live relative inline-flex size-1.5 rounded-full" />
        </span>
      ) : null}
      {children}
    </Badge>
  );
}

const MATCH_STATUS: Record<MatchStatus, { label: string; tone: Tone; pulse?: boolean }> = {
  upcoming: { label: "Upcoming", tone: "neutral" },
  live: { label: "Live", tone: "live", pulse: true },
  locked: { label: "Closed", tone: "muted" },
  resolved: { label: "Settled", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export function MatchStatusBadge({
  status,
  className,
}: {
  status: MatchStatus;
  className?: string;
}) {
  const { label, tone, pulse } = MATCH_STATUS[status];
  return (
    <StatusChip tone={tone} pulse={pulse} className={className}>
      {label}
    </StatusChip>
  );
}

const QUESTION_STATUS: Record<QuestionStatus, { label: string; tone: Tone }> = {
  active: { label: "Open", tone: "win" },
  locked: { label: "Betting closed", tone: "muted" },
  resolved: { label: "Settled", tone: "neutral" },
  void: { label: "Voided", tone: "danger" },
};

export function QuestionStatusBadge({
  status,
  className,
}: {
  status: QuestionStatus;
  className?: string;
}) {
  const { label, tone } = QUESTION_STATUS[status];
  return (
    <StatusChip tone={tone} className={className}>
      {label}
    </StatusChip>
  );
}

/**
 * `refunded` is gold rather than red: the stake came back, which is a neutral
 * outcome for the user and not the failure a destructive chip implies.
 */
const BET_STATUS: Record<BetStatus, { label: string; tone: Tone }> = {
  pending: { label: "Open", tone: "neutral" },
  won: { label: "Won", tone: "win" },
  lost: { label: "Lost", tone: "muted" },
  void: { label: "Void", tone: "muted" },
  refunded: { label: "Refunded", tone: "gold" },
};

export function BetStatusBadge({ status, className }: { status: BetStatus; className?: string }) {
  const { label, tone } = BET_STATUS[status];
  return (
    <StatusChip tone={tone} className={className}>
      {label}
    </StatusChip>
  );
}

const TICKET_STATUS: Record<SupportTicketStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "gold" },
  answered: { label: "Answered", tone: "win" },
  replied: { label: "Awaiting reply", tone: "live" },
  closed: { label: "Closed", tone: "muted" },
};

export function TicketStatusBadge({
  status,
  className,
}: {
  status: SupportTicketStatus;
  className?: string;
}) {
  const { label, tone } = TICKET_STATUS[status];
  return (
    <StatusChip tone={tone} className={className}>
      {label}
    </StatusChip>
  );
}
