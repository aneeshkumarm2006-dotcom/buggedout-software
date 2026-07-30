"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit";
import { requirePermission, type Actor } from "@/lib/authz";
import { createEventWithQuestions, type QuickTeamResult } from "@/lib/admin/setup";
import {
  GENERIC_ERROR,
  NOT_ALLOWED,
  failedFormState,
  parseJsonField,
} from "@/lib/admin/shared";
import { createTeam } from "@/lib/admin/teams";
import type { AuditEntityType } from "@/lib/enums";
import type { FormState } from "@/lib/form";
import { eventSetupSchema } from "@/schemas/event-setup";
import { createTeamSchema } from "@/schemas/team";

/**
 * The guided event builder's two mutations.
 *
 * Same four steps as every other admin action — re-check the permission against
 * the database, parse with Zod, call `lib/admin/*`, write an audit row — with
 * one addition: this screen writes across two permission domains at once, so it
 * demands *both* grants up front rather than discovering halfway through that
 * the actor could create the event but not the questions on it.
 */

/* ------------------------------------------------------------------ *
 * Publish a whole event
 * ------------------------------------------------------------------ */

export async function publishEventAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("matches.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const canWriteQuestions = await requirePermission("questions.manage");
  if (!canWriteQuestions) {
    return failedFormState(
      "You can create events but not the betting questions on them, so this screen can't finish the job. Ask an admin for the 'Manage questions' permission.",
    );
  }

  // The whole event travels as one JSON blob: a FormData cannot carry an array
  // of questions each carrying an array of answers without inventing a naming
  // convention, and the wizard is already holding it as state.
  const parsed = eventSetupSchema.safeParse(parseJsonField(formData, "event"));

  if (!parsed.success) {
    // The wizard keeps its own values — echoing them back through `FormState`
    // would mean serialising the entire draft twice per rejected submit.
    return {
      status: "error",
      message: firstIssue(parsed.error.issues) ?? "Something in the form isn't right.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  let created: Awaited<ReturnType<typeof createEventWithQuestions>>;

  try {
    created = await createEventWithQuestions(parsed.data);
  } catch (error) {
    console.error("[admin] guided event setup failed", error);
    return failedFormState(GENERIC_ERROR);
  }

  if (!created.ok) {
    return created.field
      ? { status: "error", fieldErrors: { [created.field]: [created.message] } }
      : failedFormState(created.message);
  }

  await audit(actor, "match.create", "match", created.data.matchId, {
    title: created.data.title,
    via: "guided-setup",
    questions: created.data.questionCount,
    rejectedQuestions: created.data.rejected.length,
    openForBetting: parsed.data.openForBetting,
  });

  revalidatePath("/admin/matches");
  revalidatePath("/admin");

  const flash = created.data.rejected.length
    ? `Event created with ${created.data.questionCount} question${created.data.questionCount === 1 ? "" : "s"}. ${created.data.rejected.length} couldn't be saved — add ${created.data.rejected.length === 1 ? "it" : "them"} here.`
    : `"${created.data.title}" is set up with ${created.data.questionCount} betting question${created.data.questionCount === 1 ? "" : "s"}.`;

  // `redirect` throws to do its work — it has to sit outside the try block.
  redirect(
    `/admin/matches/${created.data.matchId}/questions?flash=${encodeURIComponent(flash)}`,
  );
}

/* ------------------------------------------------------------------ *
 * Add a competitor without leaving the builder
 * ------------------------------------------------------------------ */

/**
 * The reason the old flow stalled: a missing competitor meant abandoning a
 * half-filled match form, walking to another screen, and coming back to an
 * empty one. This creates the competitor in place and hands it back so the
 * picker can select it immediately.
 *
 * Returns the row rather than an `ActionResult` — the caller needs the id, not
 * a toast.
 */
export async function quickCreateTeamAction(input: {
  name: string;
  categoryId: string;
  image: string;
}): Promise<QuickTeamResult> {
  const actor = await requirePermission("teams.manage");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  const parsed = createTeamSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error.issues) ?? "That competitor isn't valid." };
  }

  try {
    const result = await createTeam(parsed.data);
    if (!result.ok) return { ok: false, message: result.message };

    await audit(actor, "team.create", "team", result.data.id, {
      name: result.data.name,
      categoryId: parsed.data.categoryId,
      via: "guided-setup",
    });

    revalidatePath("/admin/teams");

    return {
      ok: true,
      team: {
        id: result.data.id,
        name: result.data.name,
        image: parsed.data.image,
        categoryId: parsed.data.categoryId,
      },
    };
  } catch (error) {
    console.error("[admin] quick team create failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

/* ------------------------------------------------------------------ *
 * Shared plumbing
 * ------------------------------------------------------------------ */

type Issue = { message: string; path: PropertyKey[] };

/**
 * A nested payload puts the useful complaint at `questions.2.options.1.name`,
 * which no input on the page is keyed by. The wizard shows the message; the
 * path only decides which of the four steps it sends the admin back to.
 */
function firstIssue(issues: readonly Issue[]): string | undefined {
  return issues[0]?.message;
}

function fieldErrorsFrom(issues: readonly Issue[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  for (const issue of issues) {
    const key = issue.path.length ? String(issue.path[0]) : "form";
    (errors[key] ??= []).push(issue.message);
  }

  return errors;
}

function audit(
  actor: Actor,
  action: string,
  entityType: AuditEntityType,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  return writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    metadata,
  });
}
