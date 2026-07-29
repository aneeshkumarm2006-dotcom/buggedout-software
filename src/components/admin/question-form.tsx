"use client";

import { useActionState, useState } from "react";
import { PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { MarketTemplateOption, QuestionDetail } from "@/lib/admin/questions";
import {
  EDITABLE_QUESTION_STATUSES,
  MAX_OPTIONS_PER_QUESTION,
  MIN_OPTIONS_PER_QUESTION,
} from "@/lib/enums";
import { fieldError, idleFormState, type FormState } from "@/lib/form";
import { cn } from "@/lib/utils";

/**
 * The question editor (Phase 6.8) — the market itself and its odds buttons.
 *
 * An option row that came from the database keeps its `_id`, and that is the
 * whole point: a Bet snapshots `optionId` at placement, so an edit has to move
 * the *same* option rather than swap in a new one. Rows without an id are
 * genuinely new. The server refuses to drop a row that has bets on it.
 */
type OptionDraft = {
  id?: string;
  name: string;
  ratio: string;
  active: boolean;
  /** Bets already placed on this option — shown so removal is an informed choice. */
  bets: number;
};

const STATUS_LABELS: Record<string, string> = {
  active: "Open — taking bets",
  locked: "Closed — no new bets",
};

export function QuestionForm({
  action,
  question,
  templates,
  matchId,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  question?: QuestionDetail;
  templates: MarketTemplateOption[];
  matchId: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleFormState);
  useFormToast(state);

  const [text, setText] = useState(question?.text ?? "");
  const [options, setOptions] = useState<OptionDraft[]>(() =>
    question
      ? question.options.map((option) => ({
          id: option.id,
          name: option.name,
          ratio: String(option.ratio),
          active: option.status === "active",
          bets: option.bets,
        }))
      : [emptyOption(), emptyOption()],
  );

  const questionsHref = `/admin/matches/${matchId}/questions`;
  const optionsError = fieldError(state, "options");

  function applyTemplate(template: MarketTemplateOption) {
    setText(template.question);
    setOptions(
      template.options.map((name) => ({
        name,
        ratio: String(template.defaultRatio),
        active: true,
        bets: 0,
      })),
    );
  }

  return (
    <form action={formAction} className="grid max-w-3xl gap-4" noValidate>
      <FormAlert state={state} />

      <input type="hidden" name="options" value={serialise(options)} />

      {templates.length > 0 ? (
        <FormCard
          title="Insert from template"
          description="The presets set up on this game. Inserting one replaces the question and its options."
        >
          <div className="flex flex-wrap gap-2">
            {templates.map((template, index) => (
              <Button
                key={index}
                type="button"
                variant="outline"
                size="lg"
                onClick={() => applyTemplate(template)}
              >
                <SparklesIcon />
                {template.question}
              </Button>
            ))}
          </div>
        </FormCard>
      ) : null}

      <FormCard title="Market">
        <TextField
          label="Question"
          name="text"
          required
          maxLength={200}
          value={text}
          onChange={(event) => setText(event.target.value)}
          error={fieldError(state, "text")}
          placeholder="Which lane finishes first?"
        />

        <FieldRow>
          <DateTimeField
            label="Betting closes"
            name="endDate"
            required
            defaultValue={state.values?.endDate ?? question?.endDate ?? ""}
            error={fieldError(state, "endDate")}
            hint="Locks itself at this time"
          />

          <SelectField
            label="Status"
            name="status"
            defaultValue={state.values?.status || question?.status || "active"}
            options={EDITABLE_QUESTION_STATUSES.map((value) => ({
              value,
              label: STATUS_LABELS[value]!,
            }))}
            error={fieldError(state, "status")}
            hint="Resolving and voiding happen from Results."
          />
        </FieldRow>

        <FieldRow>
          <TextField
            label="Min stake"
            name="minStakePerBet"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={state.values?.minStakePerBet ?? String(question?.minStakePerBet ?? 10)}
            error={fieldError(state, "minStakePerBet")}
          />

          <TextField
            label="Max stake"
            name="maxStakePerBet"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={
              state.values?.maxStakePerBet ?? String(question?.maxStakePerBet ?? 10_000)
            }
            error={fieldError(state, "maxStakePerBet")}
          />
        </FieldRow>
      </FormCard>

      <FormCard
        title="Options"
        description={`${MIN_OPTIONS_PER_QUESTION}–${MAX_OPTIONS_PER_QUESTION} tappable odds buttons. Editing a price only affects bets placed after it — settled bets keep the odds they were given.`}
      >
        <div className="grid gap-2">
          <div className="text-muted-foreground hidden grid-cols-[1fr_6rem_5.5rem_2.25rem] gap-2 text-xs sm:grid">
            <span>Name</span>
            <span>Odds</span>
            <span>Available</span>
            <span />
          </div>

          {options.map((option, index) => (
            <div
              key={option.id ?? `new-${index}`}
              className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_6rem_5.5rem_2.25rem]"
            >
              <Input
                value={option.name}
                maxLength={80}
                placeholder={`Option ${index + 1}`}
                aria-label={`Option ${index + 1} name`}
                onChange={(event) =>
                  setOptions((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, name: event.target.value } : row,
                    ),
                  )
                }
                className="h-11 md:h-10"
              />

              <Input
                type="number"
                min={1.01}
                max={1000}
                step={0.01}
                value={option.ratio}
                aria-label={`Option ${index + 1} odds`}
                onChange={(event) =>
                  setOptions((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, ratio: event.target.value } : row,
                    ),
                  )
                }
                className="h-11 w-24 md:h-10"
              />

              <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-1">
                <Checkbox
                  checked={option.active}
                  onCheckedChange={(checked) =>
                    setOptions((current) =>
                      current.map((row, i) =>
                        i === index ? { ...row, active: checked === true } : row,
                      ),
                    )
                  }
                />
                <span className="text-muted-foreground">
                  {option.active ? "Available" : "Suspended"}
                </span>
              </label>

              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={`Remove option ${index + 1}`}
                disabled={options.length <= MIN_OPTIONS_PER_QUESTION}
                title={
                  option.bets > 0
                    ? `${option.bets} bet${option.bets === 1 ? "" : "s"} on this — suspend it instead`
                    : undefined
                }
                onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
              >
                <Trash2Icon />
              </Button>

              {option.bets > 0 ? (
                <p className="text-muted-foreground col-span-full -mt-1 text-xs">
                  {option.bets} bet{option.bets === 1 ? "" : "s"} placed on this option.
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <p className={cn("text-xs", optionsError ? "text-destructive" : "text-muted-foreground")}>
          {optionsError ?? "Names have to be unique within the market."}
        </p>

        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={options.length >= MAX_OPTIONS_PER_QUESTION}
          onClick={() => setOptions((current) => [...current, emptyOption()])}
        >
          <PlusIcon />
          Add option
        </Button>
      </FormCard>

      <FormActions pending={pending} submitLabel={submitLabel} cancelHref={questionsHref} />
    </form>
  );
}

function emptyOption(): OptionDraft {
  return { name: "", ratio: "2", active: true, bets: 0 };
}

function serialise(options: OptionDraft[]): string {
  return JSON.stringify(
    options.map((option) => ({
      // Omitted entirely for a new row — the schema's `_id` is optional, and an
      // empty string would fail its ObjectId check.
      ...(option.id ? { _id: option.id } : {}),
      name: option.name.trim(),
      ratio: option.ratio,
      status: option.active ? "active" : "inactive",
    })),
  );
}
