"use client";

import { useActionState } from "react";

import { DateTimeField } from "@/components/admin/date-time-field";
import {
  FieldRow,
  FormActions,
  FormAlert,
  FormCard,
  SelectField,
  TextField,
  useFormToast,
} from "@/components/admin/form-parts";
import type { CategoryOption } from "@/lib/admin/categories";
import type { TournamentDetail } from "@/lib/admin/tournaments";
import { TOURNAMENT_STATUSES } from "@/lib/enums";
import { fieldError, idleFormState, type FormState } from "@/lib/form";

/** Create/edit a tournament (Phase 6.5). */
const STATUS_LABELS: Record<(typeof TOURNAMENT_STATUSES)[number], string> = {
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function TournamentForm({
  action,
  categories,
  tournament,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  categories: CategoryOption[];
  tournament?: TournamentDetail;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleFormState);
  useFormToast(state);

  return (
    <form action={formAction} className="grid max-w-2xl gap-4" noValidate>
      <FormAlert state={state} />

      <FormCard>
        <TextField
          label="Title"
          name="title"
          required
          maxLength={120}
          defaultValue={state.values?.title ?? tournament?.title ?? ""}
          error={fieldError(state, "title")}
          placeholder="Summer Shell Series"
        />

        <FieldRow>
          <SelectField
            label="Game"
            name="categoryId"
            required
            defaultValue={state.values?.categoryId || tournament?.categoryId}
            options={categories.map((category) => ({
              value: category.id,
              label:
                category.status === "active" ? category.title : `${category.title} (inactive)`,
            }))}
            error={fieldError(state, "categoryId")}
            placeholder="Pick a game"
          />

          <SelectField
            label="Status"
            name="status"
            defaultValue={state.values?.status || tournament?.status || "upcoming"}
            options={TOURNAMENT_STATUSES.map((value) => ({
              value,
              label: STATUS_LABELS[value],
            }))}
            error={fieldError(state, "status")}
          />
        </FieldRow>

        <FieldRow>
          <DateTimeField
            label="Start date"
            name="startDate"
            mode="date"
            required
            defaultValue={state.values?.startDate ?? tournament?.startDate ?? ""}
            error={fieldError(state, "startDate")}
          />

          <DateTimeField
            label="End date"
            name="endDate"
            mode="date"
            required
            defaultValue={state.values?.endDate ?? tournament?.endDate ?? ""}
            error={fieldError(state, "endDate")}
          />
        </FieldRow>
      </FormCard>

      <FormActions pending={pending} submitLabel={submitLabel} cancelHref="/admin/tournaments" />
    </form>
  );
}
