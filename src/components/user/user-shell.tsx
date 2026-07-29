import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BetSlipDock } from "@/components/bet/bet-slip-dock";
import { BetSlipProvider } from "@/components/bet/bet-slip-provider";
import { BottomNav } from "@/components/user/bottom-nav";
import { BrandMark } from "@/components/user/brand-mark";
import { LogoutButton } from "@/components/user/logout-button";
import { SideNav } from "@/components/user/side-nav";
import { TopBar } from "@/components/user/top-bar";
import type { AccountSummary } from "@/lib/account";
import { initials } from "@/lib/format";

/**
 * The signed-in app frame (Phase 5.1).
 *
 * Three columns at the widest: sidebar, content, bet slip. The two outer ones
 * are `fixed` and the middle is padded to clear them, so a long market list
 * scrolls without dragging the nav or the slip along with it.
 *
 * As the viewport narrows the columns drop away in order — the slip becomes a
 * bottom sheet below `xl`, and the sidebar becomes the bottom tab bar below
 * `lg` — which is the mobile-first layout the whole phase is designed at.
 */
export function UserShell({
  account,
  children,
}: {
  account: AccountSummary;
  children: React.ReactNode;
}) {
  return (
    // One provider around the whole shell: the slip has to survive navigating
    // from one match to another, which a per-page provider would not.
    <BetSlipProvider>
      <div className="flex flex-1 flex-col">
        <aside className="bg-sidebar fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r px-3 py-4 lg:flex">
          <div className="px-2 pb-4">
            <BrandMark eager />
          </div>

          <SideNav className="flex-1" />

          <div className="flex items-center gap-2 border-t px-1 pt-3">
            <Avatar>
              {account.avatar ? <AvatarImage src={account.avatar} alt="" /> : null}
              <AvatarFallback>{initials(account.username)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{account.username}</p>
              <p className="text-muted-foreground truncate text-xs">{account.email}</p>
            </div>

            <LogoutButton />
          </div>
        </aside>

        <div className="flex flex-1 flex-col lg:pl-60 xl:pr-80">
          <TopBar account={account} />

          {/* The padding clears the fixed tab bar (64px + safe area) on mobile. */}
          <main className="flex-1 px-4 pt-4 pb-28 lg:px-6 lg:pt-6 lg:pb-10">{children}</main>
        </div>

        <BetSlipDock />
        <BottomNav />
      </div>
    </BetSlipProvider>
  );
}
