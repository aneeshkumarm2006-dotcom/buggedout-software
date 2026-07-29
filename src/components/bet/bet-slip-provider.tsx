"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { placeBetsAction } from "@/app/(user)/actions";
import { potentialWinFor, selectionKey } from "@/lib/bet-math";
import { formatCoins } from "@/lib/format";

/**
 * Bet slip state (Phase 4.2): the selections a user has tapped, their stakes,
 * and the single submit that turns all of them into independent bets.
 *
 * Deliberately headless — Phase 5.5 hangs the bottom sheet (mobile) and the
 * right sidebar (desktop) off `useBetSlip()`, and 5.4's odds buttons use
 * `isSelected` / `toggle`. Selections live in memory only: odds and lock state
 * move, and a slip restored from storage would be quoting yesterday's price.
 */

/** Everything the slip needs about one tapped odds button. */
export type BetSlipOption = {
  matchId: string;
  matchTitle: string;
  questionId: string;
  questionText: string;
  optionId: string;
  optionName: string;
  ratio: number;
  minStake: number;
  maxStake: number;
};

export type BetSlipSelection = BetSlipOption & {
  key: string;
  stake: number;
  /** Why the server refused this row on the last submit, if it did. */
  serverError: string | null;
};

export type BetSlipRow = BetSlipSelection & {
  potentialWin: number;
  /** Rendered under the row: the stake problem, or the server's last word. */
  issue: string | null;
};

export type BetSlipContextValue = {
  rows: BetSlipRow[];
  count: number;
  totalStake: number;
  totalPotentialWin: number;
  canPlace: boolean;
  pending: boolean;
  isSelected: (questionId: string, optionId: string) => boolean;
  /** Tap an odds button: adds it, or removes it if it was already on the slip. */
  toggle: (option: BetSlipOption) => void;
  remove: (key: string) => void;
  clear: () => void;
  setStake: (key: string, stake: number) => void;
  /**
   * `onAllPlaced` fires only when the whole slip went through — the mobile
   * sheet uses it to dismiss itself. A partial success leaves the sheet open,
   * because the rows that stayed behind are carrying the reason why.
   */
  placeBets: (onAllPlaced?: () => void) => void;
};

const BetSlipContext = createContext<BetSlipContextValue | null>(null);

export function useBetSlip(): BetSlipContextValue {
  const context = useContext(BetSlipContext);

  if (!context) {
    throw new Error("useBetSlip must be used inside a <BetSlipProvider>");
  }

  return context;
}

export function BetSlipProvider({
  children,
  onPlaced,
}: {
  children: React.ReactNode;
  /** Fired after a successful submit — Phase 5.5 uses it to close the sheet. */
  onPlaced?: (placed: number) => void;
}) {
  const router = useRouter();
  const [selections, setSelections] = useState<BetSlipSelection[]>([]);
  const [pending, startTransition] = useTransition();

  const rows = useMemo<BetSlipRow[]>(
    () =>
      selections.map((selection) => ({
        ...selection,
        potentialWin: potentialWinFor(selection.stake, selection.ratio),
        issue: selection.serverError ?? stakeIssue(selection),
      })),
    [selections],
  );

  const isSelected = useCallback(
    (questionId: string, optionId: string) =>
      selections.some((selection) => selection.key === selectionKey(questionId, optionId)),
    [selections],
  );

  const toggle = useCallback((option: BetSlipOption) => {
    const key = selectionKey(option.questionId, option.optionId);

    setSelections((current) => {
      if (current.some((selection) => selection.key === key)) {
        return current.filter((selection) => selection.key !== key);
      }

      // Users may back several options of the same question — each is its own
      // bet, so nothing is displaced here.
      return [...current, { ...option, key, stake: option.minStake, serverError: null }];
    });
  }, []);

  const remove = useCallback((key: string) => {
    setSelections((current) => current.filter((selection) => selection.key !== key));
  }, []);

  const clear = useCallback(() => setSelections([]), []);

  const setStake = useCallback((key: string, stake: number) => {
    const next = Number.isFinite(stake) ? Math.max(0, Math.floor(stake)) : 0;

    setSelections((current) =>
      current.map((selection) =>
        // Editing the stake clears the server's complaint about the old one.
        selection.key === key ? { ...selection, stake: next, serverError: null } : selection,
      ),
    );
  }, []);

  const totalStake = rows.reduce((sum, row) => sum + row.stake, 0);
  const totalPotentialWin = rows.reduce((sum, row) => sum + row.potentialWin, 0);
  const canPlace = rows.length > 0 && rows.every((row) => row.issue === null) && !pending;

  const placeBets = useCallback(
    (onAllPlaced?: () => void) => {
    if (pending) return;

    startTransition(async () => {
      const submitted = selections;

      const result = await placeBetsAction({
        selections: submitted.map((selection) => ({
          questionId: selection.questionId,
          optionId: selection.optionId,
          stake: selection.stake,
        })),
      });

      const failures = new Map(result.failed.map((failure) => [failure.key, failure.message]));

      if (!result.ok) {
        toast.error(result.message);
        setSelections((current) => current.map((selection) => applyFailure(selection, failures)));
        // The slip disagrees with the server about what's still open.
        if (failures.size > 0) router.refresh();
        return;
      }

      const placedKeys = new Set(result.placed.map((bet) => bet.key));

      // Placed rows leave the slip; the ones that lost a race stay, with the
      // reason attached, so the user can fix them instead of retyping the lot.
      setSelections((current) =>
        current
          .filter((selection) => !placedKeys.has(selection.key))
          .map((selection) => applyFailure(selection, failures)),
      );

      // 7.5: the confirmation carries the two numbers the user just committed
      // to. `result.placed` is the server's list, not the slip's, so a partial
      // success reports what actually went on rather than what was asked for.
      const placedStake = result.placed.reduce((sum, bet) => sum + bet.stake, 0);
      const placedWin = result.placed.reduce((sum, bet) => sum + bet.potentialWin, 0);

      toast.success(result.message, {
        description: `${formatCoins(placedStake)} staked · ${formatCoins(placedWin)} to win`,
        duration: 5_000,
      });
      if (result.failed.length > 0) toast.warning(result.failed[0]!.message);

      onPlaced?.(result.placed.length);
      if (result.failed.length === 0) onAllPlaced?.();
      // Repaints the balance in the header and any server-rendered bet lists.
      router.refresh();
    });
    },
    [onPlaced, pending, router, selections],
  );

  const value = useMemo<BetSlipContextValue>(
    () => ({
      rows,
      count: rows.length,
      totalStake,
      totalPotentialWin,
      canPlace,
      pending,
      isSelected,
      toggle,
      remove,
      clear,
      setStake,
      placeBets,
    }),
    [
      canPlace,
      clear,
      isSelected,
      pending,
      placeBets,
      remove,
      rows,
      setStake,
      toggle,
      totalPotentialWin,
      totalStake,
    ],
  );

  return <BetSlipContext value={value}>{children}</BetSlipContext>;
}

/** Mirrors the server's stake rules so the slip can say no before the round trip. */
function stakeIssue(selection: BetSlipSelection): string | null {
  if (!Number.isInteger(selection.stake) || selection.stake <= 0) return "Enter a stake.";
  if (selection.stake < selection.minStake) {
    return `Minimum stake is ${selection.minStake.toLocaleString()} coins.`;
  }
  if (selection.stake > selection.maxStake) {
    return `Maximum stake is ${selection.maxStake.toLocaleString()} coins.`;
  }

  return null;
}

function applyFailure(
  selection: BetSlipSelection,
  failures: Map<string, string>,
): BetSlipSelection {
  const message = failures.get(selection.key);
  if (!message && !selection.serverError) return selection;

  return { ...selection, serverError: message ?? null };
}
