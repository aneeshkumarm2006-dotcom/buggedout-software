import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";

import { LocalTime } from "@/components/common/local-time";
import { PageHeader } from "@/components/common/page-header";
import { Separator } from "@/components/ui/separator";
import { ChangePasswordForm } from "@/components/user/change-password-form";
import { LogoutButton } from "@/components/user/logout-button";
import { ProfileForm } from "@/components/user/profile-form";
import { SECONDARY_NAV } from "@/components/user/nav-items";
import { auth } from "@/auth";
import { getAccountSummary } from "@/lib/account";
import { formatCoins } from "@/lib/format";

export const metadata: Metadata = { title: "Profile" };

/**
 * Profile (Phase 5.11): username, avatar, change password.
 *
 * Also where the mobile layout reaches referrals and support — the bottom tab
 * bar only has room for five destinations, and those two live on the desktop
 * sidebar. Same `SECONDARY_NAV` list, so nothing can go missing on a phone.
 */
export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const account = await getAccountSummary(session.user.id);
  if (!account) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        title={account.username}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>{account.email}</span>
            <span aria-hidden>·</span>
            <span>
              joined <LocalTime value={account.joinedAt} format="date" />
            </span>
            <span aria-hidden>·</span>
            <span className="text-primary font-medium tabular-nums">
              {formatCoins(account.coinBalance)} coins
            </span>
          </span>
        }
      />

      <nav aria-label="More" className="lg:hidden">
        <ul className="divide-border bg-card ring-foreground/10 divide-y overflow-hidden rounded-xl ring-1">
          {SECONDARY_NAV.map((item) => {
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="hover:bg-muted/50 flex h-12 items-center gap-3 px-4 text-sm font-medium transition-colors"
                >
                  <Icon className="text-muted-foreground size-4.5" />
                  {item.label}
                  <ChevronRightIcon className="text-muted-foreground ml-auto size-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="bg-card ring-foreground/10 space-y-4 rounded-xl px-5 py-4 ring-1">
        <h2 className="font-heading text-lg font-semibold">Your details</h2>
        <ProfileForm username={account.username} avatar={account.avatar} />
      </section>

      <section className="bg-card ring-foreground/10 space-y-4 rounded-xl px-5 py-4 ring-1">
        <h2 className="font-heading text-lg font-semibold">Password</h2>
        <ChangePasswordForm />
      </section>

      <Separator />

      <LogoutButton variant="full" />
    </div>
  );
}
