"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit";
import { requirePermission, type Actor } from "@/lib/authz";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/lib/admin/categories";
import { createMatch, deleteMatch, setMatchStatus, updateMatch } from "@/lib/admin/matches";
import { createQuestion, deleteQuestion, updateQuestion } from "@/lib/admin/questions";
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
import { createTeam, deleteTeam, updateTeam } from "@/lib/admin/teams";
import { createTournament, deleteTournament, updateTournament } from "@/lib/admin/tournaments";
import type { AuditEntityType, MatchStatus } from "@/lib/enums";
import type { FormState } from "@/lib/form";
import {
  createGameCategorySchema,
  updateGameCategorySchema,
} from "@/schemas/game-category";
import { createMatchSchema, setMatchStatusSchema, updateMatchSchema } from "@/schemas/match";
import { createQuestionSchema, updateQuestionSchema } from "@/schemas/question";
import { createTeamSchema, updateTeamSchema } from "@/schemas/team";
import { createTournamentSchema, updateTournamentSchema } from "@/schemas/tournament";

/**
 * Catalogue mutations: games, tournaments, teams, matches and markets
 * (Phase 6.4–6.8).
 *
 * Every one follows the same four steps — re-check the permission against the
 * database, parse the payload with Zod, hand it to `lib/admin/*`, then write an
 * audit row. A server action is a public POST, so none of those may be skipped
 * because the UI that called it looked right.
 *
 * Forms return `FormState` for `useActionState`; row buttons return
 * `ActionResult`, which the client turns into a toast.
 */

/* ------------------------------------------------------------------ *
 * 6.4 — game categories
 * ------------------------------------------------------------------ */

const CATEGORY_FIELDS = [
  "title",
  "slug",
  "cardImage",
  "animatedCard",
  "status",
  "sortOrder",
] as const;

export async function createCategoryAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("categories.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, CATEGORY_FIELDS);
  const parsed = createGameCategorySchema.safeParse({
    ...values,
    marketTemplates: parseJsonField(formData, "marketTemplates") ?? [],
  });

  if (!parsed.success) return invalidFormState(parsed.error, values);

  let categoryId: string;

  try {
    const result = await createCategory(parsed.data);
    if (!result.ok) return mutationFormState(result, values);

    categoryId = result.data.id;

    await audit(actor, "gameCategory.create", "gameCategory", categoryId, {
      title: result.data.title,
      slug: parsed.data.slug,
    });
  } catch (error) {
    return crashed("category create", error, values);
  }

  revalidatePath("/admin/categories");
  // `redirect` throws to do its work — it has to sit outside the try block.
  redirect(`/admin/categories/${categoryId}?flash=${encodeURIComponent("Game created.")}`);
}

export async function updateCategoryAction(
  categoryId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("categories.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, CATEGORY_FIELDS);
  const parsed = updateGameCategorySchema.safeParse({
    ...values,
    marketTemplates: parseJsonField(formData, "marketTemplates") ?? [],
  });

  if (!parsed.success) return invalidFormState(parsed.error, values);

  try {
    const result = await updateCategory(categoryId, parsed.data);
    if (!result.ok) return mutationFormState(result, values);

    await audit(actor, "gameCategory.update", "gameCategory", categoryId, {
      title: result.data.title,
      templates: parsed.data.marketTemplates?.length ?? 0,
    });
  } catch (error) {
    return crashed("category update", error, values);
  }

  revalidatePath("/admin/categories");
  revalidatePath(`/admin/categories/${categoryId}`);

  return { status: "success", message: "Game saved." };
}

export async function deleteCategoryAction(categoryId: string): Promise<ActionResult> {
  const actor = await requirePermission("categories.manage");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  try {
    const result = await deleteCategory(categoryId);
    if (!result.ok) return { ok: false, message: result.message };

    await audit(actor, "gameCategory.delete", "gameCategory", categoryId, {
      title: result.data.title,
    });

    revalidatePath("/admin/categories");

    return { ok: true, message: `${result.data.title} deleted.` };
  } catch (error) {
    console.error("[admin] category delete failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

/* ------------------------------------------------------------------ *
 * 6.5 — tournaments
 * ------------------------------------------------------------------ */

const TOURNAMENT_FIELDS = ["title", "categoryId", "startDate", "endDate", "status"] as const;

export async function createTournamentAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("tournaments.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, TOURNAMENT_FIELDS);
  const parsed = createTournamentSchema.safeParse(values);

  if (!parsed.success) return invalidFormState(parsed.error, values);

  let tournamentId: string;

  try {
    const result = await createTournament(parsed.data);
    if (!result.ok) return mutationFormState(result, values);

    tournamentId = result.data.id;

    await audit(actor, "tournament.create", "tournament", tournamentId, {
      title: result.data.title,
      categoryId: parsed.data.categoryId,
    });
  } catch (error) {
    return crashed("tournament create", error, values);
  }

  revalidatePath("/admin/tournaments");
  redirect(`/admin/tournaments/${tournamentId}?flash=${encodeURIComponent("Tournament created.")}`);
}

export async function updateTournamentAction(
  tournamentId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("tournaments.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, TOURNAMENT_FIELDS);
  const parsed = updateTournamentSchema.safeParse(values);

  if (!parsed.success) return invalidFormState(parsed.error, values);

  try {
    const result = await updateTournament(tournamentId, parsed.data);
    if (!result.ok) return mutationFormState(result, values);

    await audit(actor, "tournament.update", "tournament", tournamentId, {
      title: result.data.title,
    });
  } catch (error) {
    return crashed("tournament update", error, values);
  }

  revalidatePath("/admin/tournaments");
  revalidatePath(`/admin/tournaments/${tournamentId}`);

  return { status: "success", message: "Tournament saved." };
}

export async function deleteTournamentAction(tournamentId: string): Promise<ActionResult> {
  const actor = await requirePermission("tournaments.manage");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  try {
    const result = await deleteTournament(tournamentId);
    if (!result.ok) return { ok: false, message: result.message };

    await audit(actor, "tournament.delete", "tournament", tournamentId, {
      title: result.data.title,
    });

    revalidatePath("/admin/tournaments");

    return { ok: true, message: `${result.data.title} deleted.` };
  } catch (error) {
    console.error("[admin] tournament delete failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

/* ------------------------------------------------------------------ *
 * 6.6 — teams
 * ------------------------------------------------------------------ */

const TEAM_FIELDS = ["name", "categoryId", "image", "status"] as const;

export async function createTeamAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("teams.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, TEAM_FIELDS);
  const parsed = createTeamSchema.safeParse(values);

  if (!parsed.success) return invalidFormState(parsed.error, echoTeamValues(values));

  let teamId: string;

  try {
    const result = await createTeam(parsed.data);
    if (!result.ok) return mutationFormState(result, echoTeamValues(values));

    teamId = result.data.id;

    await audit(actor, "team.create", "team", teamId, {
      name: result.data.name,
      categoryId: parsed.data.categoryId,
    });
  } catch (error) {
    return crashed("team create", error, echoTeamValues(values));
  }

  revalidatePath("/admin/teams");
  redirect(`/admin/teams/${teamId}?flash=${encodeURIComponent("Team created.")}`);
}

export async function updateTeamAction(
  teamId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("teams.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, TEAM_FIELDS);
  const parsed = updateTeamSchema.safeParse(values);

  if (!parsed.success) return invalidFormState(parsed.error, echoTeamValues(values));

  try {
    const result = await updateTeam(teamId, parsed.data);
    if (!result.ok) return mutationFormState(result, echoTeamValues(values));

    await audit(actor, "team.update", "team", teamId, { name: result.data.name });
  } catch (error) {
    return crashed("team update", error, echoTeamValues(values));
  }

  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${teamId}`);

  return { status: "success", message: "Team saved." };
}

/**
 * A 64×64 crest arrives as a data URL of a few kilobytes. Echoing it back into
 * the form's hidden state is fine; echoing it into an *error banner* is not, so
 * the image is dropped from the values a rejected submit carries and the
 * uploader keeps its own copy in component state.
 */
function echoTeamValues(values: Record<string, string>): Record<string, string> {
  return { ...values, image: values.image?.startsWith("data:") ? "" : (values.image ?? "") };
}

export async function deleteTeamAction(teamId: string): Promise<ActionResult> {
  const actor = await requirePermission("teams.manage");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  try {
    const result = await deleteTeam(teamId);
    if (!result.ok) return { ok: false, message: result.message };

    await audit(actor, "team.delete", "team", teamId, { name: result.data.name });

    revalidatePath("/admin/teams");

    return { ok: true, message: `${result.data.name} deleted.` };
  } catch (error) {
    console.error("[admin] team delete failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

/* ------------------------------------------------------------------ *
 * 6.7 — matches
 * ------------------------------------------------------------------ */

const MATCH_FIELDS = ["title", "categoryId", "tournamentId", "startTime", "status"] as const;

export async function createMatchAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("matches.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, MATCH_FIELDS);
  const parsed = createMatchSchema.safeParse({
    ...values,
    teamIds: parseJsonField(formData, "teamIds") ?? [],
  });

  if (!parsed.success) return invalidFormState(parsed.error, values);

  let matchId: string;

  try {
    const result = await createMatch(parsed.data);
    if (!result.ok) return mutationFormState(result, values);

    matchId = result.data.id;

    await audit(actor, "match.create", "match", matchId, {
      title: result.data.title,
      categoryId: parsed.data.categoryId,
      teams: parsed.data.teamIds.length,
      startTime: parsed.data.startTime.toISOString(),
    });
  } catch (error) {
    return crashed("match create", error, values);
  }

  revalidatePath("/admin/matches");
  // Straight to the markets — a match with no questions can't be bet on.
  redirect(
    `/admin/matches/${matchId}/questions?flash=${encodeURIComponent("Match created. Add its markets next.")}`,
  );
}

export async function updateMatchAction(
  matchId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("matches.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, MATCH_FIELDS);
  const parsed = updateMatchSchema.safeParse({
    ...values,
    teamIds: parseJsonField(formData, "teamIds") ?? [],
  });

  if (!parsed.success) return invalidFormState(parsed.error, values);

  try {
    const result = await updateMatch(matchId, parsed.data);
    if (!result.ok) return mutationFormState(result, values);

    await audit(actor, "match.update", "match", matchId, {
      title: result.data.title,
      status: parsed.data.status ?? null,
    });
  } catch (error) {
    return crashed("match update", error, values);
  }

  revalidatePath("/admin/matches");
  revalidatePath(`/admin/matches/${matchId}`);

  return { status: "success", message: "Match saved." };
}

/** The lock/unlock buttons on a match row. */
export async function setMatchStatusAction(
  matchId: string,
  status: MatchStatus,
): Promise<ActionResult> {
  const actor = await requirePermission("matches.manage");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  const parsed = setMatchStatusSchema.safeParse({ status });
  if (!parsed.success) return { ok: false, message: "That isn't a status a match can be in." };

  try {
    const result = await setMatchStatus(matchId, parsed.data.status);
    if (!result.ok) return { ok: false, message: result.message };

    await audit(actor, "match.setStatus", "match", matchId, { status: result.data.status });

    revalidatePath("/admin/matches");

    return { ok: true, message: `${result.data.title} is now ${result.data.status}.` };
  } catch (error) {
    console.error("[admin] match status change failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function deleteMatchAction(matchId: string): Promise<ActionResult> {
  const actor = await requirePermission("matches.manage");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  try {
    const result = await deleteMatch(matchId);
    if (!result.ok) return { ok: false, message: result.message };

    await audit(actor, "match.delete", "match", matchId, { title: result.data.title });

    revalidatePath("/admin/matches");

    return { ok: true, message: `${result.data.title} deleted.` };
  } catch (error) {
    console.error("[admin] match delete failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

/* ------------------------------------------------------------------ *
 * 6.8 — questions
 * ------------------------------------------------------------------ */

const QUESTION_FIELDS = [
  "text",
  "endDate",
  "status",
  "minStakePerBet",
  "maxStakePerBet",
] as const;

export async function createQuestionAction(
  matchId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("questions.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, QUESTION_FIELDS);
  const parsed = createQuestionSchema.safeParse({
    ...values,
    matchId,
    options: parseJsonField(formData, "options") ?? [],
  });

  if (!parsed.success) return invalidFormState(parsed.error, values);

  try {
    const result = await createQuestion(parsed.data);
    if (!result.ok) return mutationFormState(result, values);

    await audit(actor, "question.create", "question", result.data.id, {
      matchId,
      text: result.data.text,
      options: parsed.data.options.length,
    });
  } catch (error) {
    return crashed("question create", error, values);
  }

  revalidatePath(`/admin/matches/${matchId}/questions`);
  redirect(
    `/admin/matches/${matchId}/questions?flash=${encodeURIComponent("Market created.")}`,
  );
}

export async function updateQuestionAction(
  questionId: string,
  matchId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("questions.manage");
  if (!actor) return failedFormState(NOT_ALLOWED);

  const values = formValues(formData, QUESTION_FIELDS);
  const parsed = updateQuestionSchema.safeParse({
    ...values,
    options: parseJsonField(formData, "options") ?? [],
  });

  if (!parsed.success) return invalidFormState(parsed.error, values);

  try {
    const result = await updateQuestion(questionId, parsed.data);
    if (!result.ok) return mutationFormState(result, values);

    await audit(actor, "question.update", "question", questionId, {
      matchId: result.data.matchId,
      text: result.data.text,
      options: parsed.data.options?.length ?? 0,
    });
  } catch (error) {
    return crashed("question update", error, values);
  }

  revalidatePath(`/admin/matches/${matchId}/questions`);
  revalidatePath(`/admin/matches/${matchId}/questions/${questionId}`);

  return { status: "success", message: "Market saved." };
}

export async function deleteQuestionAction(questionId: string): Promise<ActionResult> {
  const actor = await requirePermission("questions.manage");
  if (!actor) return { ok: false, message: NOT_ALLOWED };

  try {
    const result = await deleteQuestion(questionId);
    if (!result.ok) return { ok: false, message: result.message };

    await audit(actor, "question.delete", "question", questionId, {
      matchId: result.data.matchId,
      text: result.data.text,
    });

    revalidatePath(`/admin/matches/${result.data.matchId}/questions`);

    return { ok: true, message: "Market deleted." };
  } catch (error) {
    console.error("[admin] question delete failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

/* ------------------------------------------------------------------ *
 * Shared plumbing
 * ------------------------------------------------------------------ */

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

/** A refusal from `lib/admin/*`, aimed at the field that caused it when known. */
function mutationFormState(
  result: Extract<MutationResult<unknown>, { ok: false }>,
  values: Record<string, string>,
): FormState {
  if (result.field) {
    return { status: "error", values, fieldErrors: { [result.field]: [result.message] } };
  }

  return failedFormState(result.message, values);
}

function crashed(scope: string, error: unknown, values: Record<string, string>): FormState {
  console.error(`[admin] ${scope} failed`, error);
  return failedFormState(GENERIC_ERROR, values);
}
