import type { LucideIcon } from "lucide-react";
import {
  BadgeCheckIcon,
  CalendarRangeIcon,
  CoinsIcon,
  GavelIcon,
  HomeIcon,
  LayoutGridIcon,
  LifeBuoyIcon,
  ScrollTextIcon,
  ShieldIcon,
  SparklesIcon,
  SwordsIcon,
  TicketIcon,
  UserPlusIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";

import { hasAnyPermission, type Permission } from "@/lib/permissions";
import type { Role } from "@/lib/roles";

/**
 * The admin navigation (Phase 6.1), in one place so the desktop sidebar, the
 * mobile drawer and the access guard can never disagree about what a given
 * staff member is allowed to reach.
 *
 * Each item carries the permissions that unlock it. The shell filters the list
 * server-side before it renders — but that only hides links, so every page
 * re-checks with `requireAdminPage()`, which is what actually enforces it.
 *
 * The labels and the grouping were rewritten to describe *jobs* rather than
 * tables. "Catalogue / Results / Money / People / Operations" is the shape of
 * the database; "Run the day / Your games / Players & coins / Records" is the
 * shape of a shift. Routes, permissions and page components are untouched — only
 * the words and the order changed, and `subtitle` was added because a sidebar
 * that has to be explained to every new hire is a sidebar with a missing line
 * of text.
 */
export type AdminNavItem = {
  href: string;
  label: string;
  /** One short line, shown in the mobile drawer and on the home screen. */
  subtitle: string;
  icon: LucideIcon;
  /** Holding any one of these is enough to open the page. */
  permissions: Permission[];
  /** `/admin` would otherwise light up on every route below it. */
  exact?: boolean;
};

export type AdminNavSection = {
  title: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: readonly AdminNavSection[] = [
  {
    title: "Start here",
    items: [
      {
        href: "/admin",
        label: "Home",
        subtitle: "What needs doing right now",
        icon: HomeIcon,
        permissions: ["dashboard.view"],
        exact: true,
      },
      {
        href: "/admin/create",
        label: "Set up an event",
        subtitle: "Build a whole event in one go",
        icon: SparklesIcon,
        permissions: ["matches.manage"],
      },
    ],
  },
  {
    title: "Run the day",
    items: [
      {
        href: "/admin/matches",
        label: "Events",
        subtitle: "Everything players can bet on",
        icon: SwordsIcon,
        permissions: ["matches.view", "matches.manage"],
      },
      {
        href: "/admin/results/pending",
        label: "Results to enter",
        subtitle: "Say what happened, and everyone gets paid",
        icon: GavelIcon,
        permissions: ["results.view", "results.resolve"],
      },
      {
        href: "/admin/support",
        label: "Player messages",
        subtitle: "Questions and complaints from players",
        icon: LifeBuoyIcon,
        permissions: ["support.view", "support.reply"],
      },
    ],
  },
  {
    title: "Your games",
    items: [
      {
        href: "/admin/categories",
        label: "Games",
        subtitle: "The ten kinds of event, and their artwork",
        icon: LayoutGridIcon,
        permissions: ["categories.view", "categories.manage"],
      },
      {
        href: "/admin/teams",
        label: "Competitors",
        subtitle: "The turtles, lanes and doors players pick between",
        icon: UsersRoundIcon,
        permissions: ["teams.view", "teams.manage"],
      },
      {
        href: "/admin/tournaments",
        label: "Series",
        subtitle: "Optional — group events that belong together",
        icon: CalendarRangeIcon,
        permissions: ["tournaments.view", "tournaments.manage"],
      },
    ],
  },
  {
    title: "Players & coins",
    items: [
      {
        href: "/admin/users",
        label: "Players",
        subtitle: "Accounts, balances, bans",
        icon: UsersIcon,
        permissions: ["users.view"],
      },
      {
        href: "/admin/bets",
        label: "All bets",
        subtitle: "Every bet ever placed",
        icon: TicketIcon,
        permissions: ["bets.view"],
      },
      {
        href: "/admin/transactions",
        label: "Coin history",
        subtitle: "Every coin that has moved, and why",
        icon: CoinsIcon,
        permissions: ["transactions.view"],
      },
      {
        href: "/admin/referrals",
        label: "Refer a friend",
        subtitle: "Bonuses for bringing people in",
        icon: UserPlusIcon,
        permissions: ["referrals.view", "referrals.manage"],
      },
    ],
  },
  {
    title: "Records",
    items: [
      {
        href: "/admin/results/closed",
        label: "Past results",
        subtitle: "What was decided, and what it paid",
        icon: BadgeCheckIcon,
        permissions: ["results.view"],
      },
      {
        href: "/admin/staff",
        label: "Staff",
        subtitle: "Who can get in here, and what they can do",
        icon: ShieldIcon,
        permissions: ["staff.view", "staff.manage"],
      },
      {
        href: "/admin/audit",
        label: "Activity log",
        subtitle: "Every action staff have taken",
        icon: ScrollTextIcon,
        permissions: ["audit.view"],
      },
    ],
  },
];

export function canSeeAdminNavItem(
  item: AdminNavItem,
  role: Role | undefined | null,
  permissions: readonly string[] | undefined | null,
): boolean {
  return hasAnyPermission(role, permissions, item.permissions);
}

/** The sections this actor can actually use; empty ones are dropped entirely. */
export function visibleAdminNav(
  role: Role | undefined | null,
  permissions: readonly string[] | undefined | null,
): AdminNavSection[] {
  return ADMIN_NAV.map((section) => ({
    title: section.title,
    items: section.items.filter((item) => canSeeAdminNavItem(item, role, permissions)),
  })).filter((section) => section.items.length > 0);
}

/**
 * Where to send someone who opened a page they don't hold the permission for.
 * `null` means there is nowhere in the panel for them at all, and the caller
 * should push them back to the user site rather than loop.
 */
export function firstVisibleAdminHref(
  role: Role | undefined | null,
  permissions: readonly string[] | undefined | null,
): string | null {
  for (const section of ADMIN_NAV) {
    for (const item of section.items) {
      if (canSeeAdminNavItem(item, role, permissions)) return item.href;
    }
  }

  return null;
}

export function isAdminNavItemActive(item: AdminNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
