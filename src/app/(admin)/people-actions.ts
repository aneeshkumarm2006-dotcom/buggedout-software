"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  GENERIC_ERROR,
  NOT_ALLOWED,
  failedFormState,
  formValues,
  invalidFormState,
  parseJsonField,
  type ActionResult,
  type MutationResult,
} from "@/lib/admin/shared";
import {
  adjustUserCoins,
  createStaff,
  setUserStatus,
  updateStaff,
} from "@/lib/admin/users";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission, type Actor } from "@/lib/authz";
import { formatCoins } from "@/lib/format";
import type { FormState } from "@/lib/form";
import type { UserStatus } from "@/lib/enums";
import { adjustCoinsSchema, createUserSchema, setUserStatusSchema, updateUserSchema } from "@/schemas/user";

/**
 * Staff, roles and permissions (Phase 6.3), plus bans and manual coin
 * adjustments (Phase 6.13).
 *
 * The dangerous end of the admin panel: everything here can change who has
 * access or how many coins an account holds, so every entry point re-reads the
 * actor from the database and every write lands in the audit log with enough
 * context to answer "who did this, and why" months later.
 */

/* ------------------------------------------------------------------ *
 * 6.3 — staff
 * ------------------------------------------------------------------ */

const STAFF_FIELDS = ["email", "username", "password", "role", "status"] as const;

export async function createStaffAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("staff.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, STAFF_FIELDS);
  const parsed = createUserSchema.safeParse({
    ...values,
    permissions: parseJsonField(formData, "permissions") ?? [],
  });

  // The password is never echoed back — a rejected form re-types it.
  const echo = { ...values, password: "" };

  if (!parsed.success) return invalidFormState(parsed.error, echo);

  let staffId: string;

  try {
    const result = await createStaff(actor, parsed.data);
    if (!result.ok) return mutationFormState(result, echo);

    staffId = result.data.id;

    await audit(actor, "user.createStaff", staffId, {
      username: result.data.username,
      role: parsed.data.role,
      permissions: parsed.data.permissions,
    });
  } catch (error) {
    console.error("[admin] staff create failed", error);
    return failedFormState(GENERIC_ERROR, echo);
  }

  revalidatePath("/admin/staff");
  redirect(`/admin/staff/${staffId}?flash=${encodeURIComponent("Staff account created.")}`);
}

export async function updateStaffAction(
  staffId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("staff.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, ["email", "username", "role", "status"]);
  const parsed = updateUserSchema.safeParse({
    ...values,
    permissions: parseJsonField(formData, "permissions") ?? [],
  });

  if (!parsed.success) return invalidFormState(parsed.error, values);

  try {
    const result = await updateStaff(actor, staffId, parsed.data);
    if (!result.ok) return mutationFormState(result, values);

    await audit(actor, "user.updateStaff", staffId, {
      username: result.data.username,
      role: parsed.data.role ?? null,
      permissions: parsed.data.permissions ?? null,
      status: parsed.data.status ?? null,
    });
  } catch (error) {
    console.error("[admin] staff update failed", error);
    return failedFormState(GENERIC_ERROR, values);
  }

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${staffId}`);

  return { status: "success", message: "Staff account saved." };
}

/* ------------------------------------------------------------------ *
 * 6.13 — users
 * ------------------------------------------------------------------ */

export async function setUserStatusAction(
  userId: string,
  status: UserStatus,
  reason: string,
): Promise<ActionResult> {
  const actor = await requirePermission("users.ban");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  const parsed = setUserStatusSchema.safeParse({
    userId,
    status,
    note: reason || undefined,
  });

  if (!parsed.success) return { ok: false, message: "That request isn't valid." };

  try {
    const result = await setUserStatus(actor, parsed.data.userId, parsed.data.status);
    if (!result.ok) return { ok: false, message: result.message };

    await audit(actor, parsed.data.status === "banned" ? "user.ban" : "user.unban", userId, {
      username: result.data.username,
      reason: parsed.data.note ?? null,
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);

    return {
      ok: true,
      message:
        result.data.status === "banned"
          ? `${result.data.username} is banned.`
          : `${result.data.username} can log in again.`,
    };
  } catch (error) {
    console.error("[admin] status change failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function adjustCoinsAction(
  userId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("users.adjust_coins");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, ["direction", "amount", "note"]);
  const parsed = adjustCoinsSchema.safeParse({ ...values, userId });

  if (!parsed.success) return invalidFormState(parsed.error, values);

  let outcome: { username: string; balanceAfter: number };

  try {
    const result = await adjustUserCoins(parsed.data);
    if (!result.ok) return mutationFormState(result, values);

    outcome = result.data;

    await audit(actor, parsed.data.direction === "credit" ? "user.credit" : "user.debit", userId, {
      username: result.data.username,
      amount: parsed.data.amount,
      balanceAfter: result.data.balanceAfter,
      note: parsed.data.note,
    });
  } catch (error) {
    console.error("[admin] coin adjustment failed", error);
    return failedFormState(GENERIC_ERROR, values);
  }

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/transactions");

  return {
    status: "success",
    message: `${parsed.data.direction === "credit" ? "Credited" : "Debited"} ${formatCoins(parsed.data.amount)} coins — ${outcome.username} now holds ${formatCoins(outcome.balanceAfter)}.`,
  };
}

/* ------------------------------------------------------------------ *
 * Shared plumbing
 * ------------------------------------------------------------------ */

function audit(
  actor: Actor,
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  return writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role,
    action,
    entityType: "user",
    entityId,
    metadata,
  });
}

function mutationFormState(
  result: Extract<MutationResult<unknown>, { ok: false }>,
  values: Record<string, string>,
): FormState {
  if (result.field) {
    return { status: "error", values, fieldErrors: { [result.field]: [result.message] } };
  }

  return failedFormState(result.message, values);
}
