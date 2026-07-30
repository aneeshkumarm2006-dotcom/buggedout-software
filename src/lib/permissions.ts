/**
 * The permission catalogue backing `User.permissions[]`.
 *
 * `superadmin` implicitly holds everything; `admin` and `staff` only get what
 * is explicitly granted through the matrix in Phase 6.3. Regular users hold no
 * permissions at all. Every admin route re-checks server-side — the JWT copy is
 * only used to hide UI a user cannot act on.
 */
import type { Role } from "@/lib/roles";

export const PERMISSIONS = [
  "dashboard.view",

  "categories.view",
  "categories.manage",

  "tournaments.view",
  "tournaments.manage",

  "teams.view",
  "teams.manage",

  "matches.view",
  "matches.manage",

  "questions.view",
  "questions.manage",

  "results.view",
  "results.resolve",
  "results.void",

  "bets.view",
  "transactions.view",

  "users.view",
  "users.ban",
  "users.adjust_coins",

  "staff.view",
  "staff.manage",

  "referrals.view",
  "referrals.manage",

  "support.view",
  "support.reply",

  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

/** Superadmins bypass the matrix entirely; everyone else needs the grant. */
export function hasPermission(
  role: Role | undefined | null,
  permissions: readonly string[] | undefined | null,
  required: Permission,
): boolean {
  if (role === "superadmin") return true;
  return !!permissions?.includes(required);
}

export function hasAnyPermission(
  role: Role | undefined | null,
  permissions: readonly string[] | undefined | null,
  required: readonly Permission[],
): boolean {
  if (role === "superadmin") return true;
  return required.some((permission) => !!permissions?.includes(permission));
}

/** Default grant applied when a new staff member is created (read-only). */
export const DEFAULT_STAFF_PERMISSIONS: readonly Permission[] = [
  "dashboard.view",
  "categories.view",
  "tournaments.view",
  "teams.view",
  "matches.view",
  "questions.view",
  "results.view",
  "bets.view",
  "support.view",
];

/**
 * The same catalogue arranged for the permission matrix in Phase 6.3, with the
 * wording a human needs to grant one safely. Every entry in `PERMISSIONS` must
 * appear here exactly once — the matrix is the only place staff permissions are
 * edited, so anything missing simply could not be granted.
 */
export type PermissionGroup = {
  key: string;
  title: string;
  description: string;
  permissions: { value: Permission; label: string; hint: string }[];
};

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    key: "overview",
    title: "Overview",
    description: "The landing screen of the admin panel.",
    permissions: [
      {
        value: "dashboard.view",
        label: "View dashboard",
        hint: "Stat cards and the recent-bet feed.",
      },
    ],
  },
  {
    key: "catalogue",
    title: "Catalogue",
    description: "Games, tournaments, teams and the matches built from them.",
    permissions: [
      { value: "categories.view", label: "View games", hint: "See the game list and templates." },
      {
        value: "categories.manage",
        label: "Manage games",
        hint: "Create, edit and remove games and their market templates.",
      },
      { value: "tournaments.view", label: "View tournaments", hint: "See the tournament list." },
      {
        value: "tournaments.manage",
        label: "Manage tournaments",
        hint: "Create, edit and remove tournaments.",
      },
      { value: "teams.view", label: "View teams", hint: "See the team roster per game." },
      { value: "teams.manage", label: "Manage teams", hint: "Create, edit and remove teams." },
      { value: "matches.view", label: "View matches", hint: "See scheduled and finished matches." },
      {
        value: "matches.manage",
        label: "Manage matches",
        hint: "Create, edit, lock and remove matches.",
      },
    ],
  },
  {
    key: "markets",
    title: "Markets",
    description: "The questions users actually bet on.",
    permissions: [
      { value: "questions.view", label: "View questions", hint: "See a match's markets." },
      {
        value: "questions.manage",
        label: "Manage questions",
        hint: "Write questions and odds, and suspend a market early.",
      },
    ],
  },
  {
    key: "results",
    title: "Results",
    description: "Settling markets moves real balances — grant with care.",
    permissions: [
      {
        value: "results.view",
        label: "View results",
        hint: "See the pending queue and settled history.",
      },
      {
        value: "results.resolve",
        label: "Resolve markets",
        hint: "Pick winners and pay every outstanding bet.",
      },
      {
        value: "results.void",
        label: "Void and cancel",
        hint: "Void a market or cancel a match, refunding every stake.",
      },
    ],
  },
  {
    key: "money",
    title: "Money",
    description: "Read-only views of every coin that has moved.",
    permissions: [
      { value: "bets.view", label: "View all bets", hint: "The global bet history." },
      {
        value: "transactions.view",
        label: "View the ledger",
        hint: "Every transaction across every account.",
      },
    ],
  },
  {
    key: "people",
    title: "People",
    description: "Accounts, balances and who else can get in here.",
    permissions: [
      { value: "users.view", label: "View users", hint: "The user list and account detail." },
      { value: "users.ban", label: "Ban and unban", hint: "Suspend an account's access." },
      {
        value: "users.adjust_coins",
        label: "Adjust balances",
        hint: "Credit or debit coins by hand, with a reason.",
      },
      { value: "staff.view", label: "View staff", hint: "See who holds admin access." },
      {
        value: "staff.manage",
        label: "Manage staff",
        hint: "Add staff and change roles and permissions.",
      },
    ],
  },
  {
    key: "operations",
    title: "Operations",
    description: "The referral programme, the support queue and the audit trail.",
    permissions: [
      {
        value: "referrals.view",
        label: "View referrals",
        hint: "Programme settings and the commission log.",
      },
      {
        value: "referrals.manage",
        label: "Manage referrals",
        hint: "Change bonuses and commission rates.",
      },
      { value: "support.view", label: "View tickets", hint: "Read the support queue." },
      { value: "support.reply", label: "Answer tickets", hint: "Reply to and close tickets." },
      {
        value: "audit.view",
        label: "View the audit log",
        hint: "Every admin action, who did it and when.",
      },
    ],
  },
];

/**
 * Named jobs, for people who are hiring rather than configuring.
 *
 * Twenty-five checkboxes is the right *model* — access here really is that
 * granular, and it is re-checked on every request — but it is the wrong first
 * question to ask somebody adding their first colleague. Nobody thinks "this
 * person needs `results.resolve` and `results.void`"; they think "this person
 * enters results".
 *
 * So a job is a starting point, not a role: picking one ticks its boxes and
 * nothing else changes. The matrix is still there, still authoritative, and
 * still the thing the server reads. `grantablePermissions` still applies — a
 * job cannot hand out access the granter does not hold, because the form only
 * ever applies the intersection.
 */
export type StaffJob = {
  key: string;
  title: string;
  description: string;
  permissions: readonly Permission[];
};

export const STAFF_JOBS: readonly StaffJob[] = [
  {
    key: "viewer",
    title: "Can look, can't touch",
    description: "Sees the panel and everything in it. Changes nothing. A safe place to start.",
    permissions: DEFAULT_STAFF_PERMISSIONS,
  },
  {
    key: "builder",
    title: "Builds events",
    description:
      "Sets up games, competitors and events, and writes the betting questions. Can't enter results or touch anyone's coins.",
    permissions: [
      "dashboard.view",
      "categories.view",
      "categories.manage",
      "tournaments.view",
      "tournaments.manage",
      "teams.view",
      "teams.manage",
      "matches.view",
      "matches.manage",
      "questions.view",
      "questions.manage",
      "results.view",
      "bets.view",
    ],
  },
  {
    key: "results",
    title: "Enters results",
    description:
      "Says what happened and pays everybody out, including refunds. This one moves real balances.",
    permissions: [
      "dashboard.view",
      "categories.view",
      "teams.view",
      "matches.view",
      "matches.manage",
      "questions.view",
      "questions.manage",
      "results.view",
      "results.resolve",
      "results.void",
      "bets.view",
      "transactions.view",
    ],
  },
  {
    key: "support",
    title: "Answers players",
    description:
      "Reads and replies to player messages, and can look up an account's bets and coin history to answer them.",
    permissions: [
      "dashboard.view",
      "support.view",
      "support.reply",
      "users.view",
      "bets.view",
      "transactions.view",
      "matches.view",
      "questions.view",
      "results.view",
    ],
  },
  {
    key: "manager",
    title: "Runs the whole thing",
    description:
      "Everything above, plus bans, manual coin adjustments, the refer-a-friend settings and staff access.",
    permissions: [...PERMISSIONS],
  },
];

/** Permissions a granter may hand out — you cannot give away what you don't hold. */
export function grantablePermissions(
  role: Role | undefined | null,
  permissions: readonly string[] | undefined | null,
): Permission[] {
  if (role === "superadmin") return [...PERMISSIONS];
  return PERMISSIONS.filter((permission) => !!permissions?.includes(permission));
}
