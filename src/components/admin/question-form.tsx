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
import { PAYOUT_PRESETS, payoutExample, payoutFeel } from "@/lib/admin/wording";
import {
  EDITABLE_QUESTION_STATUSES,
  MAX_OPTIONS_PER_QUESTION,
  MIN_OPTIONS_PER_QUESTION,
} from "@/lib/enums";
import { fieldError, idleFormState, type FormState } from "@/lib/form";
import { cn } from "@/lib/utils";

/**
 * The question editor (Phase 6.8) — the question itself and the answers players
 * tap.
 *
 * An option row that came from the database keeps its `_id`, and that is the
 * whole point: a Bet snapshots `optionId` at placement, so an edit has to move
 * the *same* option rather than swap in a new one. Rows without an id are
 * genuinely new. The server refuses to drop a row that has bets on it.
 *
 * The odds column is the one thing on this screen that used to require training.
 * `2.5` is not a quantity of anything a person handles, so every row now prints
 * what it means in coins — "bet 100 → get back 250" — and the presets set a
 * whole question's prices at once. The stored value is unchanged; only the way
 * it is asked for is.
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
  active: "Taking bets",
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
          title="Start from a ready-made question"
          description="The presets set up on this game. Picking one replaces what's below."
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

      <FormCard title="The question">
        <TextField
          label="What are players betting on?"
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
            hint="Closes itself at this time — you don't have to be here"
          />

          <SelectField
            label="Right now this question is"
            name="status"
            defaultValue={state.values?.status || question?.status || "active"}
            options={EDITABLE_QUESTION_STATUSES.map((value) => ({
              value,
              label: STATUS_LABELS[value]!,
            }))}
            error={fieldError(state, "status")}
            hint="Entering the result and refunding both happen from Results to enter."
          />
        </FieldRow>

        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm select-none">
            Bet size limits (most people leave these alone)
          </summary>

          <FieldRow className="pt-3">
            <TextField
              label="Smallest bet allowed"
              name="minStakePerBet"
              type="number"
              min={1}
              step={1}
              required
              defaultValue={state.values?.minStakePerBet ?? String(question?.minStakePerBet ?? 10)}
              error={fieldError(state, "minStakePerBet")}
              hint="In coins"
            />

            <TextField
              label="Biggest bet allowed"
              name="maxStakePerBet"
              type="number"
              min={1}
              step={1}
              required
              defaultValue={
                state.values?.maxStakePerBet ?? String(question?.maxStakePerBet ?? 10_000)
              }
              error={fieldError(state, "maxStakePerBet")}
              hint="In coins, per bet"
            />
          </FieldRow>
        </details>
      </FormCard>

      <FormCard
        title="Answers players can pick"
        description={`Between ${MIN_OPTIONS_PER_QUESTION} and ${MAX_OPTIONS_PER_QUESTION}. Changing a payout only affects bets placed afterwards — a bet already placed is paid at the payout it was given.`}
      >
        <div className="grid gap-3">
          <div className="text-muted-foreground hidden grid-cols-[1fr_7rem_6rem_2.25rem] gap-2 text-xs sm:grid">
            <span>Answer</span>
            <span>Payout</span>
            <span>Offered?</span>
            <span />
          </div>

          {options.map((option, index) => {
            const ratio = Number(option.ratio);

            return (
              <div key={option.id ?? `new-${index}`} className="space-y-1.5">
                <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_7rem_6rem_2.25rem]">
                  <Input
                    value={option.name}
                    maxLength={80}
                    placeholder={`Answer ${index + 1}`}
                    aria-label={`Answer ${index + 1} name`}
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((row, i) =>
                          i === index ? { ...row, name: event.target.value } : row,
                        ),
                      )
                    }
                    className="h-11 md:h-10"
                  />

                  <div className="relative">
                    <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">
                      ×
                    </span>

                    <Input
                      type="number"
                      min={1.01}
                      max={1000}
                      step={0.05}
                      value={option.ratio}
                      aria-label={`Payout for answer ${index + 1}`}
                      onChange={(event) =>
                        setOptions((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, ratio: event.target.value } : row,
                          ),
                        )
                      }
                      className="h-11 w-full pl-6 md:h-10"
                    />
                  </div>

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
                      {option.active ? "Offered" : "Hidden"}
                    </span>
                  </label>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Remove answer ${index + 1}`}
                    disabled={options.length <= MIN_OPTIONS_PER_QUESTION}
                    title={
                      option.bets > 0
                        ? `${option.bets} bet${option.bets === 1 ? "" : "s"} on this — untick "Offered" instead of removing it`
                        : undefined
                    }
                    onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>

                <p className="text-muted-foreground text-xs">
                  {payoutExample(ratio)}
                  {payoutFeel(ratio) ? ` · ${payoutFeel(ratio)}` : ""}
                  {option.bets > 0
                    ? ` · ${option.bets} bet${option.bets === 1 ? "" : "s"} already placed on this`
                    : ""}
                </p>
              </div>
            );
          })}
        </div>

        <p className={cn("text-xs", optionsError ? "text-destructive" : "text-muted-foreground")}>
          {optionsError ?? "No two answers on the same question can share a name."}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={options.length >= MAX_OPTIONS_PER_QUESTION}
            onClick={() => setOptions((current) => [...current, emptyOption()])}
          >
            <PlusIcon />
            Add answer
          </Button>

          <span className="text-muted-foreground text-xs">Set every payout at once:</span>

          {PAYOUT_PRESETS.map((preset) => (
            <Button
              key={preset.ratio}
              type="button"
              variant="ghost"
              size="sm"
              title={`${preset.label} — ${payoutExample(preset.ratio)}`}
              onClick={() =>
                setOptions((current) =>
                  current.map((row) => ({ ...row, ratio: String(preset.ratio) })),
                )
              }
            >
              ×{preset.ratio}
            </Button>
          ))}
        </div>
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
