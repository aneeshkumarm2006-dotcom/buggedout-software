"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { GiftIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { claimDailyBonusAction } from "@/app/(user)/actions";
import { Button } from "@/components/ui/button";

/**
 * Daily bonus claim (Phase 3.5). Once claimed it turns into a countdown to the
 * next window — the server is what actually enforces the 24 hours, this is only
 * the part the thumb reaches for.
 *
 * The caller keys this on `nextClaimAt`, so a server-side change to the claim
 * window remounts the component instead of being synced into state by an effect.
 */
export function DailyBonusButton({
  amount,
  nextClaimAt,
}: {
  amount: number;
  /** ISO timestamp, or `null` when the bonus is claimable right now. */
  nextClaimAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [readyAt, setReadyAt] = useState(nextClaimAt);
  const [remaining, setRemaining] = useState(() => msUntil(nextClaimAt));

  // Only re-render on the tick; the countdown label has minute granularity.
  useEffect(() => {
    if (!readyAt) return;

    const timer = setInterval(() => setRemaining(msUntil(readyAt)), 30_000);
    return () => clearInterval(timer);
  }, [readyAt]);

  if (amount <= 0) return null;

  const isClaimable = remaining <= 0;

  function claim() {
    startTransition(async () => {
      const result = await claimDailyBonusAction();

      if (!result.ok) {
        toast.error(result.message);
        // The server disagrees with what we rendered — resync.
        router.refresh();
        return;
      }

      setReadyAt(result.nextClaimAt);
      setRemaining(msUntil(result.nextClaimAt));
      toast.success(`+${result.amount.toLocaleString()} coins claimed!`);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant={isClaimable ? "default" : "outline"}
      size="sm"
      className="h-9 px-3"
      disabled={!isClaimable || pending}
      onClick={claim}
      title={
        isClaimable
          ? `Claim your ${amount.toLocaleString()} daily coins`
          : "You've already claimed today's bonus"
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <GiftIcon />}
      {/* Server and browser evaluate "now" a moment apart, which can land either
          side of a minute boundary — a mismatch not worth warning about. */}
      <span className="tabular-nums" suppressHydrationWarning>
        {isClaimable ? `+${amount.toLocaleString()}` : formatRemaining(remaining)}
      </span>
      <span className="sr-only"> daily bonus</span>
    </Button>
  );
}

function msUntil(target: string | null): number {
  if (!target) return 0;
  return new Date(target).getTime() - Date.now();
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
