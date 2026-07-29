"use client";

import { useActionState, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";

import {
  FieldRow,
  FormActions,
  FormAlert,
  FormCard,
  SelectField,
  TextField,
  useFormToast,
} from "@/components/admin/form-parts";
import { ImageUploadField } from "@/components/common/image-upload-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoryDetail, CategoryTemplate } from "@/lib/admin/categories";
import { CONTENT_STATUSES, MAX_OPTIONS_PER_QUESTION, MIN_OPTIONS_PER_QUESTION } from "@/lib/enums";
import { fieldError, idleFormState, type FormState } from "@/lib/form";

/**
 * Create/edit a game (Phase 6.4), market templates and all.
 *
 * The templates are a nested array, which a `FormData` has no natural way to
 * carry, so they live in component state and travel as JSON in a hidden field —
 * the same trick the question editor and the match's team picker use. Zod parses
 * that JSON server-side like any other input.
 */
type TemplateDraft = {
  question: string;
  options: string[];
  defaultRatio: string;
};

const STATUS_OPTIONS = CONTENT_STATUSES.map((status) => ({
  value: status,
  label: status === "active" ? "Active — shown in the lobby" : "Inactive — hidden",
}));

export function CategoryForm({
  action,
  category,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  category?: CategoryDetail;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleFormState);
  useFormToast(state);

  const [templates, setTemplates] = useState<TemplateDraft[]>(() =>
    (category?.marketTemplates ?? []).map(toDraft),
  );

  // A rejected submit echoes back what was typed; the stored value is the
  // fallback, not the other way round.
  const value = (field: keyof CategoryDetail, fallback = "") =>
    state.values?.[field] ?? (category ? String(category[field] ?? "") : fallback);

  const [slug, setSlug] = useState(() => value("slug"));
  const cardImage = state.values?.cardImage ?? category?.cardImage ?? "";

  return (
    <form action={formAction} className="grid max-w-3xl gap-4" noValidate>
      <FormAlert state={state} />

      <FormCard title="Game">
        <FieldRow>
          <TextField
            label="Title"
            name="title"
            required
            maxLength={80}
            defaultValue={value("title")}
            error={fieldError(state, "title")}
            // Only a brand-new game gets its slug typed for it; changing an
            // existing one would break every link already shared.
            onChange={category ? undefined : (event) => setSlug(slugify(event.target.value))}
          />

          <TextField
            label="Slug"
            name="slug"
            required
            maxLength={60}
            value={category ? undefined : slug}
            defaultValue={category ? value("slug") : undefined}
            onChange={category ? undefined : (event) => setSlug(event.target.value)}
            error={fieldError(state, "slug")}
            hint="Used in the URL: /games/lane-races"
          />
        </FieldRow>

        <FieldRow>
          <SelectField
            label="Status"
            name="status"
            options={STATUS_OPTIONS}
            defaultValue={value("status", "active")}
            error={fieldError(state, "status")}
          />

          <TextField
            label="Sort order"
            name="sortOrder"
            type="number"
            min={0}
            step={1}
            defaultValue={value("sortOrder", "0")}
            error={fieldError(state, "sortOrder")}
            hint="Lower numbers come first in the lobby."
          />
        </FieldRow>
      </FormCard>

      <FormCard title="Artwork" description="Upload a card, or point at a path under /public.">
        {/* 16:9, matching the lobby tile — the uploader's own preview crops the
            way the real card will (8.2). */}
        <ImageUploadField
          label="Card image"
          name="cardImage"
          preset="game-card"
          defaultValue={cardImage}
          error={fieldError(state, "cardImage")}
          placeholder="/game-cards/lane-races.webp"
        />

        <TextField
          label="Animated card"
          name="animatedCard"
          defaultValue={state.values?.animatedCard ?? category?.animatedCard ?? ""}
          error={fieldError(state, "animatedCard")}
          placeholder="/game-cards/lane-races.mp4"
          hint="Optional. Played on desktop hover — video, so it isn't uploaded here."
        />
      </FormCard>

      <FormCard
        title="Market templates"
        description="Presets an admin can drop onto a match of this game. Copied by value — editing one here never changes a market that already exists."
      >
        <input type="hidden" name="marketTemplates" value={serialise(templates)} />

        {fieldError(state, "marketTemplates") ? (
          <p className="text-destructive text-xs">{fieldError(state, "marketTemplates")}</p>
        ) : null}

        <div className="grid gap-3">
          {templates.map((template, index) => (
            <TemplateRow
              key={index}
              template={template}
              onChange={(next) =>
                setTemplates((current) => current.map((row, i) => (i === index ? next : row)))
              }
              onRemove={() =>
                setTemplates((current) => current.filter((_, i) => i !== index))
              }
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() =>
            setTemplates((current) => [
              ...current,
              { question: "", options: ["", ""], defaultRatio: "2" },
            ])
          }
        >
          <PlusIcon />
          Add template
        </Button>
      </FormCard>

      <FormActions pending={pending} submitLabel={submitLabel} cancelHref="/admin/categories" />
    </form>
  );
}

function TemplateRow({
  template,
  onChange,
  onRemove,
}: {
  template: TemplateDraft;
  onChange: (next: TemplateDraft) => void;
  onRemove: () => void;
}) {
  const canRemoveOption = template.options.length > MIN_OPTIONS_PER_QUESTION;
  const canAddOption = template.options.length < MAX_OPTIONS_PER_QUESTION;

  return (
    <div className="border-border/70 grid gap-3 rounded-lg border p-3">
      <div className="flex items-end gap-2">
        <div className="grid flex-1 gap-1.5">
          <Label>Question</Label>
          <Input
            value={template.question}
            maxLength={200}
            placeholder="Which lane finishes first?"
            onChange={(event) => onChange({ ...template, question: event.target.value })}
            className="h-11 md:h-10"
          />
        </div>

        <div className="grid w-24 gap-1.5">
          <Label>Odds</Label>
          <Input
            type="number"
            min={1.01}
            max={1000}
            step={0.01}
            value={template.defaultRatio}
            onChange={(event) => onChange({ ...template, defaultRatio: event.target.value })}
            className="h-11 md:h-10"
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="Remove template"
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      </div>

      <div className="grid gap-2">
        <Label className="text-muted-foreground text-xs">Options</Label>

        {template.options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={option}
              maxLength={80}
              placeholder={`Option ${index + 1}`}
              onChange={(event) =>
                onChange({
                  ...template,
                  options: template.options.map((value, i) =>
                    i === index ? event.target.value : value,
                  ),
                })
              }
              className="h-10"
            />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove option ${index + 1}`}
              disabled={!canRemoveOption}
              onClick={() =>
                onChange({
                  ...template,
                  options: template.options.filter((_, i) => i !== index),
                })
              }
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          disabled={!canAddOption}
          onClick={() => onChange({ ...template, options: [...template.options, ""] })}
        >
          <PlusIcon />
          Add option
        </Button>
      </div>
    </div>
  );
}

function toDraft(template: CategoryTemplate): TemplateDraft {
  return {
    question: template.question,
    options: [...template.options],
    defaultRatio: String(template.defaultRatio),
  };
}

/** Blank rows are dropped rather than rejected — an empty draft is not an error. */
function serialise(templates: TemplateDraft[]): string {
  const filled = templates
    .map((template) => ({
      question: template.question.trim(),
      options: template.options.map((option) => option.trim()).filter(Boolean),
      defaultRatio: template.defaultRatio,
    }))
    .filter((template) => template.question !== "" || template.options.length > 0);

  return JSON.stringify(filled);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
