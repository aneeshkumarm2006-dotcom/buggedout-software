"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { GENERIC_ERROR, NOT_ALLOWED, type ActionResult } from "@/lib/admin/shared";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/authz";
import { setQuestionLock } from "@/lib/betting";
import { formatCoins } from "@/lib/format";
import {
  SettlementError,
  cancelMatch,
  previewQuestionSettlement,
  resolveQuestion,
  voidQuestion,
  type MatchCancellation,
  type QuestionSettlement,
  type SettlementPreview,
} from "@/lib/settlement";
import { cancelMatchSchema } from "@/schemas/match";
import {
  resolveQuestionSchema,
  setQuestionLockSchema,
  voidQuestionSchema,
} from "@/schemas/question";

/**
 * Betting-engine actions: lock, resolve, void, cancel (Phase 4.3–4.5), driven
 * by the Pending Results screen and the match rows (Phase 6.7, 6.9).
 *
 * Every action re-checks its permission against the database rather than the
 * session copy — a server action is a public POST endpoint, and the admin
 * layout's role check does not run for one. The ids arrive bound from the
 * server component that rendered the button, but they are parsed here all the
 * same: a bound argument is a value the browser sends back like any other.
 */
export type AdminActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

/** Suspend a live market early, or reopen one that was locked by hand (4.3). */
export async function setQuestionLockAction(
  questionId: string,
  locked: boolean,
): Promise<ActionResult> {
  const actor = await requirePermission("questions.manage");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  const parsed = setQuestionLockSchema.safeParse({ questionId, locked });
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  try {
    const result = await setQuestionLock(parsed.data.questionId, parsed.data.locked);
    if (!result.ok) return result;

    // A no-op double-click isn't worth an audit row.
    if (result.changed) {
      await writeAuditLog({
        actorId: actor.id,
        actorRole: actor.role,
        action: parsed.data.locked ? "question.lock" : "question.unlock",
        entityType: "question",
        entityId: parsed.data.questionId,
        metadata: { status: result.status },
      });
    }

    revalidateResults();

    return {
      ok: true,
      message: result.changed
        ? parsed.data.locked
          ? "Market suspended — no new bets."
          : "Market reopened."
        : `Market is already ${result.status}.`,
    };
  } catch (error) {
    console.error("[admin] lock toggle failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

/**
 * Pick the winning option(s) and pay everyone out (4.4).
 *
 * Called straight from the resolve dialog with an object rather than bound
 * arguments — `winningOptionIds` is a list the admin builds by ticking boxes.
 */
export async function resolveQuestionAction(
  input: unknown,
): Promise<AdminActionResult<QuestionSettlement>> {
  const actor = await requirePermission("results.resolve");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  const parsed = resolveQuestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  try {
    const settlement = await resolveQuestion({ ...parsed.data, actor });
    revalidateResults();

    return { ok: true, data: settlement };
  } catch (error) {
    return settlementFailure("resolve", error);
  }
}

/** Void one market and refund every stake on it (4.5). */
export async function voidQuestionAction(
  questionId: string,
  reason: string,
): Promise<ActionResult> {
  const actor = await requirePermission("results.void");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  const parsed = voidQuestionSchema.safeParse({ questionId, reason: reason || undefined });
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  try {
    const settlement = await voidQuestion({ ...parsed.data, actor });
    revalidateResults();

    return {
      ok: true,
      message:
        settlement.refunds > 0
          ? `Market voided — ${settlement.refunds} bet${settlement.refunds === 1 ? "" : "s"} refunded (${formatCoins(settlement.totalPayout)} coins).`
          : "Market voided. There was nothing to refund.",
    };
  } catch (error) {
    return settlementFailure("void", error);
  }
}

/** Cancel a match: every unresolved market on it is voided and refunded (4.5). */
export async function cancelMatchAction(matchId: string, reason: string): Promise<ActionResult> {
  const actor = await requirePermission("results.void");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  const parsed = cancelMatchSchema.safeParse({ matchId, reason: reason || undefined });
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  try {
    const cancellation: MatchCancellation = await cancelMatch({ ...parsed.data, actor });

    revalidateResults();
    revalidatePath("/admin/matches");

    return {
      ok: true,
      message:
        cancellation.betsRefunded > 0
          ? `Match cancelled — ${cancellation.betsRefunded} bet${cancellation.betsRefunded === 1 ? "" : "s"} refunded (${formatCoins(cancellation.totalRefunded)} coins).`
          : "Match cancelled. There was nothing to refund.",
    };
  } catch (error) {
    return settlementFailure("cancel", error);
  }
}

/** Payout impact for the confirm dialog, before anything is settled (6.9). */
export async function settlementPreviewAction(
  input: unknown,
): Promise<AdminActionResult<SettlementPreview>> {
  const actor = await requirePermission("results.view");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  const parsed = resolveQuestionSchema.partial({ winningOptionIds: true }).safeParse(input);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  try {
    const preview = await previewQuestionSettlement(
      parsed.data.questionId,
      parsed.data.winningOptionIds ?? [],
    );
    return { ok: true, data: preview };
  } catch (error) {
    return settlementFailure("preview", error);
  }
}

/** Both results screens, plus the dashboard's queue card, move on any of this. */
function revalidateResults(): void {
  revalidatePath("/admin/results/pending");
  revalidatePath("/admin/results/closed");
  revalidatePath("/admin");
}

/** A SettlementError is a message written for the admin; anything else is a bug. */
function settlementFailure(scope: string, error: unknown): { ok: false; message: string } {
  if (error instanceof SettlementError) return { ok: false, message: error.message };

  console.error(`[admin] ${scope} failed`, error);
  return { ok: false, message: GENERIC_ERROR };
}

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "That request isn't valid.";
}
