"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { changePassword, updateProfile } from "@/lib/account";
import { placeBets, type PlacedBet, type SelectionError } from "@/lib/betting";
import type { FormState } from "@/lib/form";
import { BETTING_RATE_LIMITS, formatRetryAfter, rateLimit } from "@/lib/rate-limit";
import { createTicket, replyToTicket } from "@/lib/support";
import { WalletError, claimDailyBonus, nextDailyBonusAt } from "@/lib/wallet";
import { placeBetsSchema } from "@/schemas/bet";
import { createSupportTicketSchema, replySupportTicketSchema } from "@/schemas/support-ticket";
import { changePasswordSchema, updateProfileSchema } from "@/schemas/user";

/**
 * User-facing wallet, betting, support and profile actions (Phases 3.5,
 * 4.1–4.2, 5.10, 5.11).
 *
 * Server Actions are reachable by a direct POST, so the session is re-read here
 * rather than trusted from anything the client sends — the button only decides
 * what to render.
 */
export type ClaimDailyBonusResult =
  | { ok: true; amount: number; balance: number; nextClaimAt: string }
  | { ok: false; message: string };

export async function claimDailyBonusAction(): Promise<ClaimDailyBonusResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ok: false, message: "Log in to claim your daily bonus." };
  }

  try {
    const movement = await claimDailyBonus(session.user.id);
    const nextClaimAt = nextDailyBonusAt(new Date())!;

    return {
      ok: true,
      amount: movement.amount,
      balance: movement.balanceAfter,
      nextClaimAt: nextClaimAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof WalletError) {
      return { ok: false, message: error.message };
    }

    console.error("[daily-bonus] claim failed", error);
    return { ok: false, message: "Could not claim your bonus. Please try again." };
  }
}

/**
 * Places the whole bet slip (Phase 4.1, 4.2). Every selection is an independent
 * bet, so the result reports them individually — the slip keeps any that could
 * not be placed and clears the rest.
 */
export type PlaceBetsActionResult =
  | {
      ok: true;
      message: string;
      placed: PlacedBet[];
      failed: SelectionError[];
      totalStake: number;
      balance: number;
    }
  | { ok: false; message: string; failed: SelectionError[] };

export async function placeBetsAction(input: unknown): Promise<PlaceBetsActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ok: false, message: "Log in to place a bet.", failed: [] };
  }

  const parsed = placeBetsSchema.safeParse(input);

  if (!parsed.success) {
    // Every real complaint about a slip ("Add at least one selection", "At most
    // 20 per submit", a duplicated option) hangs off the `selections` array, so
    // it lands in `fieldErrors`, not `formErrors` — reading only the latter
    // turned all of them into the same unhelpful fallback.
    const flattened = z.flattenError(parsed.error);

    return {
      ok: false,
      message:
        flattened.formErrors[0] ??
        Object.values(flattened.fieldErrors).flat()[0] ??
        "That bet slip isn't valid.",
      failed: [],
    };
  }

  const limit = rateLimit(`bets:${session.user.id}`, BETTING_RATE_LIMITS.placeBets);
  if (!limit.ok) {
    return {
      ok: false,
      message: `Slow down a moment — try again in ${formatRetryAfter(limit.retryAfterSeconds)}.`,
      failed: [],
    };
  }

  try {
    const result = await placeBets(session.user.id, parsed.data.selections);

    if (!result.ok) return result;

    return {
      ...result,
      message:
        result.failed.length > 0
          ? `${result.placed.length} of ${result.placed.length + result.failed.length} bets placed.`
          : result.placed.length === 1
            ? `Bet placed — ${result.placed[0]!.stake.toLocaleString()} coins on ${result.placed[0]!.optionName}.`
            : `${result.placed.length} bets placed for ${result.totalStake.toLocaleString()} coins.`,
    };
  } catch (error) {
    console.error("[bets] placement failed", error);
    return { ok: false, message: "Could not place your bets. Please try again.", failed: [] };
  }
}

/* ------------------------------------------------------------------ *
 * 5.10 — support tickets
 * ------------------------------------------------------------------ */

/**
 * Raises a ticket and jumps straight into the thread.
 *
 * `redirect` throws to do its work, so it has to sit outside the try block —
 * catching it would turn a created ticket into an error banner.
 */
export async function createTicketAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { status: "error", message: "Log in to contact support." };

  const values = {
    subject: String(formData.get("subject") ?? ""),
    message: String(formData.get("message") ?? ""),
  };

  const parsed = createSupportTicketSchema.safeParse(values);

  if (!parsed.success) {
    return { status: "error", values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  let ticketId: string;

  try {
    const result = await createTicket(session.user.id, parsed.data);
    if (!result.ok) return { status: "error", values, message: result.message };
    ticketId = result.ticketId;
  } catch (error) {
    console.error("[support] could not create ticket", error);
    return { status: "error", values, message: "Could not open your ticket. Please try again." };
  }

  redirect(`/support/${ticketId}`);
}

export async function replyToTicketAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { status: "error", message: "Log in to reply." };

  const values = { body: String(formData.get("body") ?? "") };
  const parsed = replySupportTicketSchema.safeParse({
    ticketId: formData.get("ticketId"),
    body: values.body,
  });

  if (!parsed.success) {
    return { status: "error", values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    const result = await replyToTicket(session.user.id, parsed.data.ticketId, parsed.data.body);
    if (!result.ok) return { status: "error", values, message: result.message };
  } catch (error) {
    console.error("[support] could not post reply", error);
    return { status: "error", values, message: "Could not send your reply. Please try again." };
  }

  // The thread is a server component; this is what repaints it with the new message.
  revalidatePath(`/support/${parsed.data.ticketId}`);

  return { status: "success" };
}

/* ------------------------------------------------------------------ *
 * 5.11 — profile
 * ------------------------------------------------------------------ */

export async function updateProfileAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { status: "error", message: "Log in to edit your profile." };

  const values = {
    username: String(formData.get("username") ?? ""),
    avatar: String(formData.get("avatar") ?? ""),
  };

  const parsed = updateProfileSchema.safeParse(values);

  if (!parsed.success) {
    return { status: "error", values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    const result = await updateProfile(session.user.id, parsed.data);

    if (!result.ok) {
      return result.field
        ? { status: "error", values, fieldErrors: { [result.field]: [result.message] } }
        : { status: "error", values, message: result.message };
    }
  } catch (error) {
    console.error("[profile] update failed", error);
    return { status: "error", values, message: "Could not save your profile. Please try again." };
  }

  // The name and avatar are rendered by the shell's layout, not just this page.
  revalidatePath("/", "layout");

  return { status: "success", message: "Profile updated.", values };
}

/**
 * The session keeps working afterwards: the JWT carries no password material,
 * and forcing a re-login on the device that just changed the password would
 * punish the one person we know is legitimate.
 */
export async function changePasswordAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { status: "error", message: "Log in to change your password." };

  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { status: "error", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    const result = await changePassword(
      session.user.id,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );

    if (!result.ok) {
      return result.field
        ? { status: "error", fieldErrors: { [result.field]: [result.message] } }
        : { status: "error", message: result.message };
    }
  } catch (error) {
    console.error("[profile] password change failed", error);
    return { status: "error", message: "Could not change your password. Please try again." };
  }

  return { status: "success", message: "Password changed." };
}
