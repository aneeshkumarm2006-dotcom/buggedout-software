/**
 * Domain enums shared by the Mongoose models (`src/models`), the Zod input
 * schemas (`src/schemas`) and the UI. Declared as `as const` tuples so they can
 * be fed straight into `enum:` on a schema path and `z.enum()` alike.
 *
 * Roles live in `src/lib/roles.ts` (the proxy imports them and must stay free
 * of anything that drags Mongoose into the edge bundle).
 */

export const USER_STATUSES = ["active", "banned"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Generic on/off used by GameCategory, Team and question options. */
export const CONTENT_STATUSES = ["active", "inactive"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const TOURNAMENT_STATUSES = ["upcoming", "ongoing", "completed", "cancelled"] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const MATCH_STATUSES = ["upcoming", "live", "locked", "resolved", "cancelled"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const QUESTION_STATUSES = ["active", "locked", "resolved", "void"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/**
 * What the admin forms in Phase 6.7/6.8 may set directly.
 *
 * `cancelled` and `void` are settlement's to write (4.4–4.5) — reaching them
 * refunds real balances, and a status dropdown that skipped the payouts would
 * leave every open stake stranded. Declared here rather than in `lib/admin/*`
 * so the client-side forms can read them without importing a server module.
 */
export const EDITABLE_MATCH_STATUSES: readonly MatchStatus[] = [
  "upcoming",
  "live",
  "locked",
  "resolved",
];

export const EDITABLE_QUESTION_STATUSES: readonly QuestionStatus[] = ["active", "locked"];

export const BET_STATUSES = ["pending", "won", "lost", "void", "refunded"] as const;
export type BetStatus = (typeof BET_STATUSES)[number];

export const TRANSACTION_TYPES = [
  "signup_bonus",
  "daily_bonus",
  "bet_place",
  "bet_win",
  "bet_refund",
  "admin_credit",
  "admin_debit",
  "referral_commission",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * Sign each transaction type moves the balance in. `Transaction.amount` is
 * stored signed so `sum(amount) === coinBalance` for any user, which is what
 * makes the ledger auditable. The wallet service (Phase 3.4) is the only place
 * allowed to apply these.
 */
export const TRANSACTION_DIRECTION: Record<TransactionType, 1 | -1> = {
  signup_bonus: 1,
  daily_bonus: 1,
  bet_place: -1,
  bet_win: 1,
  bet_refund: 1,
  admin_credit: 1,
  admin_debit: -1,
  referral_commission: 1,
};

export const SUPPORT_TICKET_STATUSES = ["open", "answered", "replied", "closed"] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

/** Who wrote a ticket message — drives left/right bubble alignment in the thread. */
export const SUPPORT_SENDER_TYPES = ["user", "staff"] as const;
export type SupportSenderType = (typeof SUPPORT_SENDER_TYPES)[number];

/** What a referral commission percentage is applied to on settlement. */
export const REFERRAL_COMMISSION_BASES = ["stake", "winnings"] as const;
export type ReferralCommissionBasis = (typeof REFERRAL_COMMISSION_BASES)[number];

/** Entities an admin mutation can target; recorded on every AuditLog row. */
export const AUDIT_ENTITY_TYPES = [
  "user",
  "gameCategory",
  "tournament",
  "team",
  "match",
  "question",
  "bet",
  "transaction",
  "referralSetting",
  "supportTicket",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** Odds bounds — a ratio below 1 would pay out less than the stake. */
export const MIN_RATIO = 1.01;
export const MAX_RATIO = 1000;

/** Teams per match, per the match builder in Phase 6.7. */
export const MIN_TEAMS_PER_MATCH = 2;
export const MAX_TEAMS_PER_MATCH = 8;

/** Options per question — a yes/no market at minimum, 8 lanes/doors at most. */
export const MIN_OPTIONS_PER_QUESTION = 2;
export const MAX_OPTIONS_PER_QUESTION = 8;

/** Team images are stored at exactly this size (client-resized on upload, 6.6). */
export const TEAM_IMAGE_SIZE = 64;
