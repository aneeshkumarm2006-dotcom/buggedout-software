import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";

import { AdminMobileNav, AdminSideNav } from "@/components/admin/admin-nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/user/logout-button";
import { initials } from "@/lib/format";
import type { Role } from "@/lib/roles";

const ROLE_LABEL: Record<Role, string> = {
  user: "User",
  staff: "Staff",
  admin: "Admin",
  superadmin: "Super admin",
};

/**
 * The admin frame (Phase 6.1).
 *
 * Two columns above `lg` — a fixed sidebar and a scrolling content column
 * padded to clear it — collapsing to a drawer below that. The tables inside are
 * wide by nature, so the content column is allowed to scroll horizontally on
 * its own rather than the page doing it.
 *
 * `visibleNav` arrives already filtered by the layout's permission check; this
 * component never decides what someone may see.
 */
export function AdminShell({
  username,
  role,
  visibleNav,
  children,
}: {
  username: string;
  role: Role;
  visibleNav: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <aside className="bg-sidebar fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <Link href="/admin" className="font-heading text-lg font-bold tracking-tight">
            Bugged<span className="text-primary">Out</span>
            <span className="text-muted-foreground ml-1.5 text-xs font-medium">admin</span>
          </Link>
        </div>

        <AdminSideNav visible={visibleNav} className="flex-1 px-3 py-4" />

        <div className="flex items-center gap-2 border-t px-3 py-3">
          <Avatar>
            <AvatarFallback>{initials(username)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{username}</p>
            <p className="text-muted-foreground truncate text-xs">{ROLE_LABEL[role]}</p>
          </div>

          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="bg-background/90 sticky top-0 z-30 border-b backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-3 lg:h-16 lg:px-6">
            <AdminMobileNav visible={visibleNav} />

            <span className="font-heading text-base font-bold lg:hidden">
              Bugged<span className="text-primary">Out</span>
            </span>

            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className="hidden sm:inline-flex">
                {ROLE_LABEL[role]}
              </Badge>

              <Button asChild variant="outline" size="lg">
                <Link href="/">
                  <ExternalLinkIcon />
                  <span className="hidden sm:inline">View site</span>
                </Link>
              </Button>

              <span className="lg:hidden">
                <LogoutButton />
              </span>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 lg:px-6 lg:py-6">{children}</main>
      </div>
    </div>
  );
}
