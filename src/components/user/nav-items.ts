import type { LucideIcon } from "lucide-react";
import {
  LayoutGridIcon,
  LifeBuoyIcon,
  TicketIcon,
  TrophyIcon,
  UserRoundIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

/**
 * The user-site navigation, in one place so the bottom tab bar and the desktop
 * sidebar can never drift apart (Phase 5.1).
 *
 * `primary` is the five-item set the thumb reaches on a phone. `secondary`
 * items only have room on the desktop sidebar; the profile page links to them
 * so they stay reachable on mobile.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * `/` would otherwise light up on every route, so the lobby matches exactly
   * and everything else matches its own subtree (`/matches/…` under My Bets is
   * deliberately *not* one — a match page belongs to the lobby branch).
   */
  exact?: boolean;
  /** Extra path prefixes that should keep this item highlighted. */
  alsoActiveFor?: string[];
};

export const PRIMARY_NAV: NavItem[] = [
  {
    href: "/",
    label: "Lobby",
    icon: LayoutGridIcon,
    exact: true,
    alsoActiveFor: ["/games", "/matches"],
  },
  { href: "/my-bets", label: "My Bets", icon: TicketIcon },
  { href: "/leaderboard", label: "Leaders", icon: TrophyIcon },
  { href: "/wallet", label: "Wallet", icon: WalletIcon },
  { href: "/profile", label: "Profile", icon: UserRoundIcon },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/referrals", label: "Referrals", icon: UsersIcon },
  { href: "/support", label: "Support", icon: LifeBuoyIcon },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const matches = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  if (item.exact ? pathname === item.href : matches(item.href)) return true;

  return !!item.alsoActiveFor?.some(matches);
}
