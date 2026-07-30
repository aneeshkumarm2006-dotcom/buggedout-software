"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, GavelIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { resolveQuestionAction, settlementPreviewAction } from "@/app/(admin)/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ACTIONS } from "@/lib/admin/wording";
import { formatCoins, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Pick the winner(s) and settle (Phase 6.9).
 *
 * The payout impact is not a guess: opening the dialog asks the server what
 * every option *would* cost if it won, and the figure under the confirm button
 * is the sum of whatever is ticked. One round trip, exact arithmetic, and no
 * stale number sitting in the page since it was rendered.
 *
 * Settling is idempotent server-side (4.6), so a double-click can't pay twice —
 * but it moves real balances, which is why nothing here happens on one tap.
 */
type PreviewOption = {
  optionId: string;
  optionName: string;
  bets: number;
  stake: number;
  /** What this option would pay if it were a winner. */
  payout: number;
};

type Preview = {
  pendingBets: number;
  uniqueBettors: number;
  totalStake: number;
  perOption: PreviewOption[];
};

export function ResolveDialog({
  questionId,
  questionText,
  options,
  triggerLabel = ACTIONS.resolve.short,
  triggerVariant = "default",
  triggerSize = "sm",
}: {
  questionId: string;
  questionText: string;
  options: { id: string; name: string; ratio: number }[];
  triggerLabel?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [winners, setWinners] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function loadPreview() {
    setLoading(true);
    setError(null);

    // Asking for *every* option as a winner makes each row's `payout` its full
    // exposure, so ticking boxes afterwards is plain addition.
    const result = await settlementPreviewAction({
      questionId,
      winningOptionIds: options.map((option) => option.id),
    });

    if (result.ok) {
      setPreview(result.data);
    } else {
      setError(result.message);
    }

    setLoading(false);
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;

    setOpen(next);

    if (next) {
      setWinners([]);
      setPreview(null);
      void loadPreview();
    } else {
      setError(null);
    }
  }

  function toggle(optionId: string) {
    setWinners((current) =>
      current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId],
    );
  }

  function confirm() {
    if (winners.length === 0) {
      setError("Tick what actually happened first.");
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await resolveQuestionAction({ questionId, winningOptionIds: winners });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      const { winners: paid, totalPayout, failed } = result.data;

      toast.success(
        paid > 0
          ? `Done — ${paid} winning bet${paid === 1 ? "" : "s"} paid out ${formatCoins(totalPayout)} coins.`
          : "Done. Nobody had bet on that outcome, so there was nothing to pay.",
      );

      if (failed > 0) {
        toast.error(
          `${failed} player${failed === 1 ? "" : "s"} couldn't be paid. Enter the same result again to finish paying them — nobody gets paid twice.`,
        );
      }

      setOpen(false);
      router.refresh();
    });
  }

  const payoutByOption = new Map(
    (preview?.perOption ?? []).map((option) => [option.optionId, option]),
  );

  const totalPayout = winners.reduce(
    (sum, optionId) => sum + (payoutByOption.get(optionId)?.payout ?? 0),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} size={triggerSize}>
          <GavelIcon />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>What actually happened?</DialogTitle>
          <DialogDescription>
            {questionText}
            <span className="mt-1.5 block">
              Tick every answer that came true. Everyone who picked it gets paid; everyone else
              doesn&apos;t. You&apos;ll see the exact cost before you confirm.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {options.map((option) => {
            const stats = payoutByOption.get(option.id);
            const selected = winners.includes(option.id);

            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(option.id)}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                  selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                )}
              >
                {/* A drawn box, not a Checkbox: that renders its own <button>,
                    and a button inside a button is invalid HTML — React
                    reports it as a hydration error. The row is the control. */}
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input",
                  )}
                >
                  {selected ? <CheckIcon className="size-3.5" /> : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{option.name}</span>
                  <span className="text-muted-foreground block text-xs tabular-nums">
                    ×{formatRatio(option.ratio)} ·{" "}
                    {loading
                      ? "…"
                      : `${stats?.bets ?? 0} bet${(stats?.bets ?? 0) === 1 ? "" : "s"}, ${formatCoins(stats?.stake ?? 0)} staked`}
                  </span>
                </span>

                <span
                  className={cn(
                    "text-right text-xs tabular-nums",
                    selected ? "text-primary font-medium" : "text-muted-foreground",
                  )}
                >
                  {loading ? "" : `costs ${formatCoins(stats?.payout ?? 0)}`}
                </span>
              </button>
            );
          })}
        </div>

        <div className="bg-muted/50 grid gap-1 rounded-lg p-3 text-sm">
          {loading ? (
            <span className="text-muted-foreground flex items-center gap-2">
              <Loader2Icon className="size-3.5 animate-spin" />
              Working out what this will cost…
            </span>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bets waiting</span>
                <span className="tabular-nums">
                  {formatCoins(preview?.pendingBets ?? 0)} from{" "}
                  {formatCoins(preview?.uniqueBettors ?? 0)} player
                  {(preview?.uniqueBettors ?? 0) === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Coins staked</span>
                <span className="tabular-nums">{formatCoins(preview?.totalStake ?? 0)}</span>
              </div>

              <div className="flex justify-between font-medium">
                <span>Will pay out</span>
                <span className="text-primary tabular-nums">{formatCoins(totalPayout)} coins</span>
              </div>
            </>
          )}
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>

          <Button type="button" size="lg" disabled={pending || loading} onClick={confirm}>
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            {pending
              ? "Paying everyone…"
              : totalPayout > 0
                ? `Confirm — pay out ${formatCoins(totalPayout)}`
                : "Confirm result"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
