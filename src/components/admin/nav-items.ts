import type { LucideIcon } from "lucide-react";
import {
  BadgeCheckIcon,
  CalendarRangeIcon,
  ClipboardListIcon,
  CoinsIcon,
  GaugeIcon,
  GavelIcon,
  LayoutGridIcon,
  LifeBuoyIcon,
  ScrollTextIcon,
  ShieldIcon,
  SwordsIcon,
  TicketIcon,
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
 */
export type AdminNavItem = {
  href: string;
  label: string;
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
    title: "Overview",
    items: [
      {
        href: "/admin",
        label: "Dashboard",
        icon: GaugeIcon,
        permissions: ["dashboard.view"],
        exact: true,
      },
    ],
  },
  {
    title: "Catalogue",
    items: [
      {
        href: "/admin/categories",
        label: "Games",
        icon: LayoutGridIcon,
        permissions: ["categories.view", "categories.manage"],
      },
      {
        href: "/admin/tournaments",
        label: "Tournaments",
        icon: CalendarRangeIcon,
        permissions: ["tournaments.view", "tournaments.manage"],
      },
      {
        href: "/admin/teams",
        label: "Teams",
        icon: UsersRoundIcon,
        permissions: ["teams.view", "teams.manage"],
      },
      {
        href: "/admin/matches",
        label: "Matches",
        icon: SwordsIcon,
        permissions: ["matches.view", "matches.manage"],
      },
    ],
  },
  {
    title: "Results",
    items: [
      {
        href: "/admin/results/pending",
        label: "Pending results",
        icon: GavelIcon,
        permissions: ["results.view", "results.resolve"],
      },
      {
        href: "/admin/results/closed",
        label: "Closed results",
        icon: BadgeCheckIcon,
        permissions: ["results.view"],
      },
    ],
  },
  {
    title: "Money",
    items: [
      {
        href: "/admin/bets",
        label: "Bet history",
        icon: TicketIcon,
        permissions: ["bets.view"],
      },
      {
        href: "/admin/transactions",
        label: "Transactions",
        icon: CoinsIcon,
        permissions: ["transactions.view"],
      },
    ],
  },
  {
    title: "People",
    items: [
      {
        href: "/admin/users",
        label: "Users",
        icon: UsersIcon,
        permissions: ["users.view"],
      },
      {
        href: "/admin/staff",
        label: "Staff",
        icon: ShieldIcon,
        permissions: ["staff.view", "staff.manage"],
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        href: "/admin/support",
        label: "Support",
        icon: LifeBuoyIcon,
        permissions: ["support.view", "support.reply"],
      },
      {
        href: "/admin/referrals",
        label: "Referrals",
        icon: ClipboardListIcon,
        permissions: ["referrals.view", "referrals.manage"],
      },
      {
        href: "/admin/audit",
        label: "Audit log",
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
