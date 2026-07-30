/**
 * The words the admin panel says out loud.
 *
 * The codebase names things the way the database does — category, match,
 * market, question, ratio, resolve, void — and every one of those is a term of
 * art somebody has to be taught. The people who run this panel day to day are
 * not the people who built it, so the screens say something plainer and this
 * module is the only place that decides what.
 *
 * Nothing here renames a route, a field or a permission. It is a display layer:
 * change a word once and the sidebar, the page titles, the badges and the
 * confirm dialogs all follow.
 *
 * Kept free of `server-only` and of every model import — client components read
 * these labels too.
 */
import type {
  BetStatus,
  ContentStatus,
  MatchStatus,
  QuestionStatus,
  TournamentStatus,
  TransactionType,
} from "@/lib/enums";

/* ------------------------------------------------------------------ *
 * Nouns
 * ------------------------------------------------------------------ */

/**
 * What each database word is called on screen. Singular and plural, because
 * "1 markets waiting" is the kind of thing that makes a panel feel unfinished.
 */
export const NOUNS = {
  category: { one: "game", many: "games", Title: "Game", TitlePlural: "Games" },
  tournament: { one: "series", many: "series", Title: "Series", TitlePlural: "Series" },
  team: {
    one: "competitor",
    many: "competitors",
    Title: "Competitor",
    TitlePlural: "Competitors",
  },
  match: { one: "event", many: "events", Title: "Event", TitlePlural: "Events" },
  question: {
    one: "betting question",
    many: "betting questions",
    Title: "Betting question",
    TitlePlural: "Betting questions",
  },
  option: { one: "answer", many: "answers", Title: "Answer", TitlePlural: "Answers" },
  user: { one: "player", many: "players", Title: "Player", TitlePlural: "Players" },
} as const;

export type NounKey = keyof typeof NOUNS;

/** `count(2, "match")` → "2 events"; `count(1, "match")` → "1 event". */
export function count(n: number, noun: NounKey): string {
  const word = NOUNS[noun];
  return `${n.toLocaleString()} ${n === 1 ? word.one : word.many}`;
}

/* ------------------------------------------------------------------ *
 * Statuses
 * ------------------------------------------------------------------ */

export type StatusWording = {
  /** What the badge says. */
  label: string;
  /** One sentence: what this state means for the people betting. */
  meaning: string;
};

/**
 * An event's five states. `upcoming`/`live`/`locked` are all "still going" and
 * a non-technical reader has no way to know that from the words themselves, so
 * the meaning line spells out whether bets are being taken.
 */
export const MATCH_STATUS_WORDING: Record<MatchStatus, StatusWording> = {
  upcoming: {
    label: "Scheduled",
    meaning: "Players can bet on it now. It hasn't started yet.",
  },
  live: {
    label: "Happening now",
    meaning: "The event is running and players can still bet.",
  },
  locked: {
    label: "Betting closed",
    meaning: "No more bets. Waiting for you to enter the result.",
  },
  resolved: {
    label: "Finished",
    meaning: "The result is in and everyone has been paid.",
  },
  cancelled: {
    label: "Cancelled",
    meaning: "Called off. Every open bet was refunded.",
  },
};

/** A betting question's four states. */
export const QUESTION_STATUS_WORDING: Record<QuestionStatus, StatusWording> = {
  active: {
    label: "Taking bets",
    meaning: "Players can bet on this question right now.",
  },
  locked: {
    label: "Needs a result",
    meaning: "Betting has closed. Nobody gets paid until you enter what happened.",
  },
  resolved: {
    label: "Result entered",
    meaning: "Winners have been paid. This one is done.",
  },
  void: {
    label: "Cancelled",
    meaning: "Called off. Everyone got their coins back.",
  },
};

export const TOURNAMENT_STATUS_WORDING: Record<TournamentStatus, StatusWording> = {
  upcoming: { label: "Not started", meaning: "Scheduled, but no events have run yet." },
  ongoing: { label: "Running", meaning: "Events in this series are happening now." },
  completed: { label: "Finished", meaning: "Every event in the series has been played." },
  cancelled: { label: "Cancelled", meaning: "Called off." },
};

export const BET_STATUS_WORDING: Record<BetStatus, StatusWording> = {
  pending: { label: "Waiting", meaning: "The result hasn't been entered yet." },
  won: { label: "Won", meaning: "Paid out." },
  lost: { label: "Lost", meaning: "The stake was kept." },
  void: { label: "Cancelled", meaning: "The bet was cancelled." },
  refunded: { label: "Refunded", meaning: "The stake went back to the player." },
};

/** On/off, used by games, competitors and individual answers. */
export const CONTENT_STATUS_WORDING: Record<ContentStatus, StatusWording> = {
  active: { label: "Showing", meaning: "Players can see and use this." },
  inactive: { label: "Hidden", meaning: "Kept, but not offered to players." },
};

/** Every coin movement, said the way a person would say it. */
export const TRANSACTION_WORDING: Record<TransactionType, string> = {
  signup_bonus: "Welcome coins",
  daily_bonus: "Daily free coins",
  bet_place: "Bet placed",
  bet_win: "Bet won",
  bet_refund: "Bet refunded",
  admin_credit: "Coins added by staff",
  admin_debit: "Coins taken by staff",
  referral_commission: "Refer-a-friend reward",
};

/* ------------------------------------------------------------------ *
 * Verbs — the buttons that move money
 * ------------------------------------------------------------------ */

/**
 * The four dangerous actions, and the plain sentence each one owes the person
 * about to press it. "Resolve" and "void" are the two words in this panel most
 * likely to be pressed by someone who does not know what they do.
 */
export const ACTIONS = {
  resolve: {
    label: "Enter the result",
    short: "Enter result",
    explains: "Pick what actually happened. Everyone who got it right gets paid straight away.",
  },
  void: {
    label: "Cancel and refund",
    short: "Cancel & refund",
    explains: "Nobody wins or loses. Every player gets their coins back.",
  },
  lock: {
    label: "Stop taking bets",
    short: "Stop bets",
    explains: "Closes betting now. Nothing is paid out yet.",
  },
  unlock: {
    label: "Start taking bets again",
    short: "Reopen bets",
    explains: "Players can bet on this again.",
  },
  cancelMatch: {
    label: "Call off this event",
    short: "Call it off",
    explains:
      "Cancels every question that hasn't been decided yet and refunds those bets. Questions you already settled stay paid.",
  },
} as const;

/* ------------------------------------------------------------------ *
 * Odds, in money
 * ------------------------------------------------------------------ */

/** The stake used in every "bet this, get that" example on screen. */
export const EXAMPLE_STAKE = 100;

/**
 * "×2.5" means nothing until it is money. Every place the panel shows a payout
 * multiplier shows this beside it.
 */
export function payoutExample(ratio: number, stake: number = EXAMPLE_STAKE): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "—";
  return `Bet ${stake.toLocaleString()} → get back ${Math.floor(stake * ratio).toLocaleString()}`;
}

/** How likely the odds say this answer is — the intuition behind the number. */
export function payoutFeel(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 1) return "";
  if (ratio < 1.6) return "Strong favourite";
  if (ratio < 2.4) return "About even";
  if (ratio < 4) return "Outsider";
  return "Long shot";
}

/**
 * The presets on the payout field. Someone pricing a four-lane race should not
 * have to reason about decimal odds to get something sensible on screen.
 */
export const PAYOUT_PRESETS: readonly { ratio: number; label: string }[] = [
  { ratio: 1.5, label: "Favourite" },
  { ratio: 2, label: "Even" },
  { ratio: 3, label: "Outsider" },
  { ratio: 5, label: "Long shot" },
];

/** An even split across `n` answers, with the house edge the presets imply. */
export function evenRatioFor(optionCount: number): number {
  if (optionCount < 2) return 2;
  return Math.max(1.05, Math.round((optionCount * 0.92) * 100) / 100);
}
