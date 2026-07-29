"use server";

import { revalidatePath } from "next/cache";

import {
  GENERIC_ERROR,
  NOT_ALLOWED,
  failedFormState,
  formValues,
  invalidFormState,
  type ActionResult,
} from "@/lib/admin/shared";
import { updateReferralSettings } from "@/lib/admin/referrals";
import { replyToTicket, setTicketStatus } from "@/lib/admin/support";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/authz";
import type { SupportTicketStatus } from "@/lib/enums";
import type { FormState } from "@/lib/form";
import { updateReferralSettingSchema } from "@/schemas/referral-setting";
import { replySupportTicketSchema, updateSupportTicketSchema } from "@/schemas/support-ticket";

/**
 * Referral settings (Phase 6.11) and the support queue (Phase 6.14).
 *
 * Same contract as the other admin action files: re-check the permission
 * against the database, parse with Zod, do the work in `lib/admin/*`, write an
 * audit row.
 */

/* ------------------------------------------------------------------ *
 * 6.11 — referral settings
 * ------------------------------------------------------------------ */

const REFERRAL_FIELDS = [
  "enabled",
  "signupBonusReferrer",
  "signupBonusReferred",
  "commissionPercent",
  "commissionBasis",
] as const;

export async function updateReferralSettingsAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("referrals.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, REFERRAL_FIELDS);
  const parsed = updateReferralSettingSchema.safeParse(values);

  if (!parsed.success) return invalidFormState(parsed.error, values);

  try {
    const result = await updateReferralSettings(parsed.data);
    if (!result.ok) return failedFormState(result.message, values);

    await writeAuditLog({
      actorId: actor.id,
      actorRole: actor.role,
      action: "referralSetting.update",
      entityType: "referralSetting",
      metadata: { ...parsed.data },
    });
  } catch (error) {
    console.error("[admin] referral settings update failed", error);
    return failedFormState(GENERIC_ERROR, values);
  }

  revalidatePath("/admin/referrals");
  // The user-facing referrals page quotes these numbers back.
  revalidatePath("/referrals");

  return { status: "success", message: "Referral settings saved." };
}

/* ------------------------------------------------------------------ *
 * 6.14 — support
 * ------------------------------------------------------------------ */

export async function replyToTicketAction(
  ticketId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("support.reply");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, ["body"]);
  const parsed = replySupportTicketSchema.safeParse({ ticketId, body: values.body });

  if (!parsed.success) return invalidFormState(parsed.error, values);

  try {
    const result = await replyToTicket(actor.id, parsed.data.ticketId, parsed.data.body);
    if (!result.ok) return failedFormState(result.message, values);

    await writeAuditLog({
      actorId: actor.id,
      actorRole: actor.role,
      action: "supportTicket.reply",
      entityType: "supportTicket",
      entityId: ticketId,
      metadata: { subject: result.data.subject },
    });
  } catch (error) {
    console.error("[admin] ticket reply failed", error);
    return failedFormState(GENERIC_ERROR, values);
  }

  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${ticketId}`);
  // The user is reading the same thread from the other side.
  revalidatePath(`/support/${ticketId}`);

  return { status: "success", message: "Reply sent." };
}

export async function setTicketStatusAction(
  ticketId: string,
  status: SupportTicketStatus,
): Promise<ActionResult> {
  const actor = await requirePermission("support.reply");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  const parsed = updateSupportTicketSchema.safeParse({ status });
  if (!parsed.success) return { ok: false, message: "That isn't a status a ticket can be in." };

  try {
    const result = await setTicketStatus(actor.id, ticketId, parsed.data.status);
    if (!result.ok) return { ok: false, message: result.message };

    await writeAuditLog({
      actorId: actor.id,
      actorRole: actor.role,
      action: parsed.data.status === "closed" ? "supportTicket.close" : "supportTicket.reopen",
      entityType: "supportTicket",
      entityId: ticketId,
      metadata: { subject: result.data.subject, status: result.data.status },
    });

    revalidatePath("/admin/support");
    revalidatePath(`/admin/support/${ticketId}`);
    revalidatePath(`/support/${ticketId}`);

    return {
      ok: true,
      message: parsed.data.status === "closed" ? "Ticket closed." : "Ticket reopened.",
    };
  } catch (error) {
    console.error("[admin] ticket status change failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}
