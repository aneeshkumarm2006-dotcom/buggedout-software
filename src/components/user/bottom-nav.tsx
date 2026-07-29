"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PRIMARY_NAV, isNavItemActive } from "@/components/user/nav-items";
import { cn } from "@/lib/utils";

/**
 * The mobile tab bar (Phase 5.1) — five destinations, thumb height, hidden from
 * `lg` up where the sidebar takes over.
 *
 * `env(safe-area-inset-bottom)` is what keeps the tabs clear of the iOS home
 * indicator; the root layout already opts into it with `viewportFit: "cover"`.
 * The matching spacer that stops content hiding behind this bar lives in the
 * shell, so the two can't disagree about the height.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-md items-stretch">
        {PRIMARY_NAV.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // 44px is the floor for a touch target; the row is 64px tall.
                  "flex h-full min-w-11 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
