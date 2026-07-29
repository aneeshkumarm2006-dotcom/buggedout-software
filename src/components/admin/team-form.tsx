"use client";

import { useActionState } from "react";

import {
  FieldRow,
  FormActions,
  FormAlert,
  FormCard,
  SelectField,
  TextField,
  useFormToast,
} from "@/components/admin/form-parts";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import type { CategoryOption } from "@/lib/admin/categories";
import type { TeamDetail } from "@/lib/admin/teams";
import { CONTENT_STATUSES, TEAM_IMAGE_SIZE } from "@/lib/enums";
import { fieldError, idleFormState, type FormState } from "@/lib/form";

/** Create/edit a team (Phase 6.6). The crest is resized client-side to 64×64. */
export function TeamForm({
  action,
  categories,
  team,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  categories: CategoryOption[];
  team?: TeamDetail;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleFormState);
  useFormToast(state);

  return (
    <form action={formAction} className="grid max-w-2xl gap-4" noValidate>
      <FormAlert state={state} />

      <FormCard>
        <FieldRow>
          <TextField
            label="Name"
            name="name"
            required
            maxLength={60}
            defaultValue={state.values?.name ?? team?.name ?? ""}
            error={fieldError(state, "name")}
            placeholder="Turtle A"
          />

          <SelectField
            label="Game"
            name="categoryId"
            required
            defaultValue={state.values?.categoryId || team?.categoryId}
            options={categories.map((category) => ({
              value: category.id,
              label:
                category.status === "active" ? category.title : `${category.title} (inactive)`,
            }))}
            error={fieldError(state, "categoryId")}
            placeholder="Pick a game"
            hint="Team names only have to be unique within a game."
          />
        </FieldRow>

        <ImageUploadField
          label="Crest"
          name="image"
          size={TEAM_IMAGE_SIZE}
          // A data URL isn't echoed back on a rejected submit, so the stored
          // image is the fallback and the uploader keeps any new pick itself.
          defaultValue={state.values?.image || team?.image || ""}
          error={fieldError(state, "image")}
        />

        <SelectField
          label="Status"
          name="status"
          defaultValue={state.values?.status || team?.status || "active"}
          options={CONTENT_STATUSES.map((value) => ({
            value,
            label: value === "active" ? "Active" : "Inactive — not offered on new matches",
          }))}
          error={fieldError(state, "status")}
          className="sm:max-w-xs"
        />
      </FormCard>

      <FormActions pending={pending} submitLabel={submitLabel} cancelHref="/admin/teams" />
    </form>
  );
}
