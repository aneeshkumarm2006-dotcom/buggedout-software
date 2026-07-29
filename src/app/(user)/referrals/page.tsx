import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CopyButton } from "@/components/common/copy-button";
import { EMPTY_ART, EmptyState } from "@/components/common/empty-state";
import { LocalTime } from "@/components/common/local-time";
import { PageHeader } from "@/components/common/page-header";
import { auth } from "@/auth";
import { getAccountSummary } from "@/lib/account";
import { formatCoins, formatPercent } from "@/lib/format";
import { getReferralSummary } from "@/lib/referrals";
import { getBaseUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Referrals" };

/**
 * Referrals (Phase 5.9): the code, the link, who has used it, what it earned.
 *
 * Earnings are the sum of the account's `referral_commission` ledger rows, so
 * the number here and the rows on the wallet page are the same data — there is
 * no second tally to drift out of step.
 */
export default async function ReferralsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const account = await getAccountSummary(session.user.id);
  if (!account) redirect("/login");

  const [referrals, baseUrl] = await Promise.all([
    getReferralSummary(account.id, account.referralCode),
    getBaseUrl(),
  ]);

  const shareLink = `${baseUrl}/signup?ref=${referrals.code}`;
  const { program } = referrals;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader
        title="Referrals"
        description="Bring a friend along and take a cut of the action."
      />

      {!program.enabled ? (
        <div className="border-border text-muted-foreground rounded-xl border border-dashed px-4 py-3 text-sm">
          The referral programme is paused right now. Your code still works — rewards will resume
          when it&rsquo;s switched back on.
        </div>
      ) : null}

      <section className="bg-card ring-foreground/10 space-y-4 rounded-xl px-5 py-4 ring-1">
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs tracking-wide uppercase">Your code</p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="bg-muted rounded-lg px-3 py-2 text-lg font-bold tracking-[0.2em] tabular-nums">
              {referrals.code}
            </code>
            <CopyButton value={referrals.code} label="Copy code" />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs tracking-wide uppercase">Share link</p>
          <div className="flex flex-wrap items-center gap-3">
            {/* Breaks anywhere so a long origin can't push the card sideways at 375px. */}
            <span className="bg-muted text-muted-foreground min-w-0 flex-1 rounded-lg px-3 py-2 text-xs break-all">
              {shareLink}
            </span>
            <CopyButton value={shareLink} label="Copy link" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Friends joined" value={referrals.referredCount.toString()} />
        <Stat label="Coins earned" value={formatCoins(referrals.totalEarned)} accent />
        <Stat
          label="Rewards paid"
          value={referrals.payouts.toString()}
          className="col-span-2 sm:col-span-1"
        />
      </section>

      <section className="bg-card ring-foreground/10 space-y-2 rounded-xl px-5 py-4 text-sm ring-1">
        <h2 className="font-heading font-semibold">How it pays</h2>
        <ul className="text-muted-foreground list-disc space-y-1 pl-4">
          {program.signupBonusReferrer > 0 ? (
            <li>
              <span className="text-foreground font-medium">
                {formatCoins(program.signupBonusReferrer)} coins
              </span>{" "}
              the moment a friend signs up with your code.
            </li>
          ) : null}
          {program.signupBonusReferred > 0 ? (
            <li>
              Your friend starts with an extra{" "}
              <span className="text-foreground font-medium">
                {formatCoins(program.signupBonusReferred)} coins
              </span>{" "}
              on top of the welcome bonus.
            </li>
          ) : null}
          {program.commissionPercent > 0 ? (
            <li>
              <span className="text-foreground font-medium">
                {formatPercent(program.commissionPercent)}
              </span>{" "}
              of every bet they settle, taken from{" "}
              {program.commissionBasis === "winnings" ? "their winnings" : "their stake"}.
            </li>
          ) : null}
          <li>Rewards land in your wallet automatically — nothing to claim.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Friends you brought</h2>

        {referrals.recent.length === 0 ? (
          <EmptyState
            art={EMPTY_ART.referrals}
            title="No referrals yet"
            description="Share your link — everyone who signs up with it shows up here."
          />
        ) : (
          <ul className="divide-border bg-card ring-foreground/10 divide-y overflow-hidden rounded-xl ring-1">
            {referrals.recent.map((friend) => (
              <li key={friend.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="truncate text-sm font-medium">{friend.username}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  joined <LocalTime value={friend.joinedAt} format="date" />
                </span>
              </li>
            ))}
          </ul>
        )}

        {referrals.referredCount > referrals.recent.length ? (
          <p className="text-muted-foreground text-xs">
            Showing the {referrals.recent.length} most recent of {referrals.referredCount}.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("bg-card ring-foreground/10 rounded-xl px-4 py-3 ring-1", className)}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("text-2xl font-bold tabular-nums", accent && "text-primary")}>{value}</p>
    </div>
  );
}
