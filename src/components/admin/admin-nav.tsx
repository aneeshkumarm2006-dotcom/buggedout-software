"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";

import {
  ADMIN_NAV,
  isAdminNavItemActive,
  type AdminNavItem,
} from "@/components/admin/nav-items";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The admin navigation, desktop and mobile (Phase 6.1).
 *
 * `visible` is a list of hrefs computed on the *server* from the actor's real
 * permissions — the icons and labels come from this module's own import of
 * `ADMIN_NAV`, because a Lucide component can't cross the server/client
 * boundary as a prop. Nothing here grants access; it only decides what to draw.
 */
function useVisibleSections(visible: readonly string[]) {
  const allowed = new Set(visible);

  return ADMIN_NAV.map((section) => ({
    title: section.title,
    items: section.items.filter((item) => allowed.has(item.href)),
  })).filter((section) => section.items.length > 0);
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: AdminNavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = isAdminNavItemActive(item, pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4.5 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavSections({
  visible,
  onNavigate,
}: {
  visible: readonly string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sections = useVisibleSections(visible);

  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <p className="text-muted-foreground/80 px-3 pb-1 text-[11px] font-semibold tracking-wider uppercase">
            {section.title}
          </p>

          {section.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

export function AdminSideNav({
  visible,
  className,
}: {
  visible: readonly string[];
  className?: string;
}) {
  return (
    <div className={cn("overflow-y-auto", className)}>
      <NavSections visible={visible} />
    </div>
  );
}

/**
 * Below `lg` the sidebar becomes a drawer. It closes on navigation — Next keeps
 * the client component mounted across a route change, so an open sheet would
 * otherwise sit on top of the page the admin just asked for.
 */
export function AdminMobileNav({ visible }: { visible: readonly string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Open admin menu">
          <MenuIcon />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetHeader className="border-b">
          <SheetTitle className="font-heading text-base">
            Bugged<span className="text-primary">Out</span> admin
          </SheetTitle>
          <SheetDescription className="text-xs">Everything you have access to.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavSections visible={visible} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
