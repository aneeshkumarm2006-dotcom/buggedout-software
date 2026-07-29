"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PRIMARY_NAV, SECONDARY_NAV, isNavItemActive, type NavItem } from "@/components/user/nav-items";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Desktop sidebar (Phase 5.1). Carries the same five destinations as the mobile
 * tab bar plus the two that only fit here — referrals and support, which the
 * profile page also links to so a phone can still reach them.
 */
export function SideNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn("flex flex-col gap-1 text-sm", className)}
    >
      {PRIMARY_NAV.map((item) => (
        <SideNavLink key={item.href} item={item} pathname={pathname} />
      ))}

      <Separator className="my-3" />

      {SECONDARY_NAV.map((item) => (
        <SideNavLink key={item.href} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}

function SideNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isNavItemActive(item, pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-lg px-3 font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4.5" />
      {item.label}
    </Link>
  );
}
