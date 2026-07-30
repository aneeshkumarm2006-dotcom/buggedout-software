"use client";

import { useActionState, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  Loader2Icon,
  PlusIcon,
  RocketIcon,
  SparklesIcon,
  Trash2Icon,
  UsersRoundIcon,
  WandSparklesIcon,
} from "lucide-react";

import { publishEventAction } from "@/app/(admin)/setup-actions";
import { DateTimeField } from "@/components/admin/date-time-field";
import { FormAlert, useFormToast } from "@/components/admin/form-parts";
import { QuickTeamDialog } from "@/components/admin/quick-team-dialog";
import { AssetImage } from "@/components/common/asset-image";
import { LocalTime } from "@/components/common/local-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SetupCatalogue, SetupGame, SetupTeam } from "@/lib/admin/setup";
import {
  PAYOUT_PRESETS,
  evenRatioFor,
  payoutExample,
  payoutFeel,
} from "@/lib/admin/wording";
import {
  MAX_OPTIONS_PER_QUESTION,
  MAX_TEAMS_PER_MATCH,
  MIN_OPTIONS_PER_QUESTION,
  MIN_TEAMS_PER_MATCH,
  TEAM_IMAGE_SIZE,
} from "@/lib/enums";
import { idleFormState } from "@/lib/form";
import { cn } from "@/lib/utils";

/**
 * The guided event builder.
 *
 * The panel's precise screens are still there and still authoritative. This is
 * the *general* way through: one page, five plain questions, and everything a
 * live event needs written at the end of it — including competitors, which can
 * be added in place instead of sending you to another screen mid-form.
 *
 * Three rules it is built on:
 *
 *  1. Never ask for something that can be worked out. The event's name, the
 *     answers to "who wins?", the moment betting closes and every payout all
 *     arrive pre-filled and correct for the common case.
 *  2. Never show a number without showing what it means. Odds are printed as
 *     "bet 100 → get back 250" everywhere they appear.
 *  3. Never let a step be wrong. Continue is refused with a plain sentence
 *     rather than letting the whole thing fail at the end.
 */
const STEPS = [
  { key: "game", title: "Game", question: "Which game is this?" },
  { key: "teams", title: "Competitors", question: "Who's taking part?" },
  { key: "details", title: "Name & time", question: "What's it called, and when?" },
  { key: "questions", title: "Betting", question: "What can people bet on?" },
  { key: "review", title: "Check", question: "Ready to go?" },
] as const;

type StepIndex = 0 | 1 | 2 | 3 | 4;

type DraftAnswer = { key: string; name: string; ratio: string };

type DraftQuestion = {
  key: string;
  text: string;
  answers: DraftAnswer[];
  /** Betting shuts when the event starts — true for almost every question. */
  closesAtStart: boolean;
  closesAt: string;
};

export function EventWizard({
  catalogue,
  canAddCompetitors,
}: {
  catalogue: SetupCatalogue;
  canAddCompetitors: boolean;
}) {
  const [state, formAction, pending] = useActionState(publishEventAction, idleFormState);
  useFormToast(state);

  const [step, setStep] = useState<StepIndex>(0);
  const [stepError, setStepError] = useState<string | null>(null);

  const [gameId, setGameId] = useState("");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<SetupTeam[]>(catalogue.teams);
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [startIso, setStartIso] = useState("");
  // Worked out when the value changes rather than during render: `Date.now()`
  // in a render body is both a lint error here and a hydration mismatch, since
  // the server and the browser do not agree on "now".
  const [startInPast, setStartInPast] = useState(false);
  const [seriesId, setSeriesId] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [openForBetting, setOpenForBetting] = useState(true);

  const game = catalogue.games.find((candidate) => candidate.id === gameId) ?? null;
  const gameTeams = useMemo(
    () => teams.filter((team) => team.categoryId === gameId),
    [teams, gameId],
  );
  const gameSeries = catalogue.series.filter((series) => series.categoryId === gameId);
  const picked = teamIds
    .map((id) => teams.find((team) => team.id === id))
    .filter((team): team is SetupTeam => !!team);

  const suggestedTitle = useMemo(() => suggestName(game, picked), [game, picked]);

  /** The single JSON payload the action parses. */
  const payload = JSON.stringify({
    categoryId: gameId,
    tournamentId: seriesId,
    title: (titleTouched ? title : title || suggestedTitle).trim(),
    startTime: startIso,
    teamIds,
    openForBetting,
    questions: questions.map((question) => ({
      text: question.text.trim(),
      closesAtStart: question.closesAtStart,
      closesAt: question.closesAtStart ? null : question.closesAt,
      options: question.answers.map((answer) => ({
        name: answer.name.trim(),
        ratio: answer.ratio,
      })),
    })),
  });

  function go(next: StepIndex) {
    setStepError(null);
    setStep(next);
  }

  function advance() {
    const problem = validate(step);

    if (problem) {
      setStepError(problem);
      return;
    }

    // Landing on the naming step with nothing typed: fill in the suggestion so
    // there is something sensible to accept rather than a blank required field.
    if (step === 1 && !titleTouched && !title) setTitle(suggestedTitle);

    // And landing on the betting step for the first time: offer the game's own
    // presets rather than an empty screen with an "Add" button on it.
    if (step === 2 && questions.length === 0) {
      setQuestions(seedQuestions(game, picked, gameTeams));
    }

    go(Math.min(step + 1, STEPS.length - 1) as StepIndex);
  }

  function validate(current: StepIndex): string | null {
    if (current === 0 && !gameId) return "Pick a game to carry on.";

    if (current === 1) {
      if (teamIds.length < MIN_TEAMS_PER_MATCH) {
        return `Pick at least ${MIN_TEAMS_PER_MATCH} competitors — an event needs something to compare.`;
      }
    }

    if (current === 2) {
      if (!(titleTouched ? title : title || suggestedTitle).trim()) {
        return "Give the event a name. It's what players see in the lobby.";
      }
      if (!startIso) return "Set the day and time this event starts.";
    }

    if (current === 3) {
      if (questions.length === 0) {
        return "Add at least one betting question — an event with none can't be bet on.";
      }

      for (const [index, question] of questions.entries()) {
        if (!question.text.trim()) return `Question ${index + 1} needs some words.`;

        if (question.answers.length < MIN_OPTIONS_PER_QUESTION) {
          return `Question ${index + 1} needs at least ${MIN_OPTIONS_PER_QUESTION} answers.`;
        }

        if (question.answers.some((answer) => !answer.name.trim())) {
          return `Every answer on question ${index + 1} needs a name.`;
        }

        const names = question.answers.map((answer) => answer.name.trim().toLowerCase());
        if (new Set(names).size !== names.length) {
          return `Question ${index + 1} has two answers with the same name.`;
        }

        if (question.answers.some((answer) => !(Number(answer.ratio) > 1))) {
          return `Every payout on question ${index + 1} has to be more than 1 — otherwise a winning bet pays less than it cost.`;
        }

        if (!question.closesAtStart && !question.closesAt) {
          return `Question ${index + 1} needs a closing time.`;
        }
      }
    }

    return null;
  }

  function setStart(iso: string) {
    setStartIso(iso);
    setStartInPast(!!iso && new Date(iso).getTime() < Date.now());
    setStepError(null);
  }

  function pickGame(id: string) {
    setGameId(id);
    // Everything downstream belongs to the old game and would fail validation.
    setTeamIds([]);
    setSeriesId("");
    setQuestions([]);
    if (!titleTouched) setTitle("");
  }

  function toggleTeam(id: string) {
    setStepError(null);
    setTeamIds((current) =>
      current.includes(id)
        ? current.filter((teamId) => teamId !== id)
        : current.length >= MAX_TEAMS_PER_MATCH
          ? current
          : [...current, id],
    );
  }

  function patchQuestion(key: string, patch: Partial<DraftQuestion>) {
    setStepError(null);
    setQuestions((current) =>
      current.map((question) => (question.key === key ? { ...question, ...patch } : question)),
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-5"
      noValidate
      // Enter in a text field is implicit submission, which from step 2 would
      // publish a half-built event. On every step but the last it means
      // "continue" instead, which is what pressing it in a wizard should do.
      onKeyDown={(event) => {
        if (event.key !== "Enter" || step === STEPS.length - 1) return;
        if (event.target instanceof HTMLTextAreaElement) return;

        event.preventDefault();
        advance();
      }}
    >
      <input type="hidden" name="event" value={payload} />

      <Stepper step={step} onJump={go} />

      <FormAlert state={state} />

      <section className="bg-card ring-foreground/10 space-y-5 rounded-xl p-4 ring-1 sm:p-5">
        <header className="space-y-1">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="font-heading text-lg font-bold sm:text-xl">{STEPS[step].question}</h2>
        </header>

        {step === 0 ? (
          <GameStep games={catalogue.games} teams={teams} value={gameId} onPick={pickGame} />
        ) : null}

        {step === 1 && game ? (
          <TeamStep
            game={game}
            teams={gameTeams}
            selected={teamIds}
            onToggle={toggleTeam}
            canAddCompetitors={canAddCompetitors}
            onCreated={(team) => {
              setTeams((current) => [...current, team]);
              setTeamIds((current) =>
                current.length >= MAX_TEAMS_PER_MATCH ? current : [...current, team.id],
              );
              setStepError(null);
            }}
          />
        ) : null}

        {step === 2 && game ? (
          <DetailsStep
            title={titleTouched ? title : title || suggestedTitle}
            suggestion={suggestedTitle}
            onTitle={(value) => {
              setTitleTouched(true);
              setTitle(value);
              setStepError(null);
            }}
            startIso={startIso}
            startsInThePast={startInPast}
            onStart={setStart}
            series={gameSeries}
            seriesId={seriesId}
            onSeries={setSeriesId}
          />
        ) : null}

        {step === 3 && game ? (
          <QuestionStep
            game={game}
            picked={picked}
            roster={gameTeams}
            questions={questions}
            startIso={startIso}
            onPatch={patchQuestion}
            onAdd={(question) => {
              setStepError(null);
              setQuestions((current) => [...current, question]);
            }}
            onRemove={(key) =>
              setQuestions((current) => current.filter((question) => question.key !== key))
            }
          />
        ) : null}

        {step === 4 && game ? (
          <ReviewStep
            game={game}
            picked={picked}
            title={(titleTouched ? title : title || suggestedTitle).trim()}
            startIso={startIso}
            seriesTitle={gameSeries.find((series) => series.id === seriesId)?.title ?? null}
            questions={questions}
            openForBetting={openForBetting}
            onOpenForBetting={setOpenForBetting}
            onJump={go}
          />
        ) : null}

        {stepError ? (
          <p className="text-destructive flex items-start gap-2 text-sm">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            {stepError}
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => go((step - 1) as StepIndex)}
          >
            <ArrowLeftIcon />
            Back
          </Button>
        ) : null}

        {/* The keys matter. Without them React reconciles these two as the same
            element and simply patches `type` from "button" to "submit" — and on
            the click that moves you onto the last step, that patch lands before
            the browser has decided what the click does, so Continue publishes
            the event instead of showing you the review. Distinct keys make it a
            remount, so the node you clicked is still a plain button. */}
        {step < STEPS.length - 1 ? (
          <Button key="continue" type="button" size="lg" onClick={advance}>
            Continue
            <ArrowRightIcon />
          </Button>
        ) : (
          <Button key="publish" type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <RocketIcon />}
            {pending
              ? "Setting it up…"
              : openForBetting
                ? "Publish and open betting"
                : "Set it up, keep betting closed"}
          </Button>
        )}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * Step 1 — the game
 * ------------------------------------------------------------------ */

function GameStep({
  games,
  teams,
  value,
  onPick,
}: {
  games: SetupGame[];
  teams: SetupTeam[];
  value: string;
  onPick: (id: string) => void;
}) {
  const countByGame = new Map<string, number>();
  for (const team of teams) {
    if (team.status !== "active") continue;
    countByGame.set(team.categoryId, (countByGame.get(team.categoryId) ?? 0) + 1);
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {games.map((game) => {
        const selected = game.id === value;
        const competitors = countByGame.get(game.id) ?? 0;

        return (
          <button
            key={game.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onPick(game.id)}
            className={cn(
              "group ring-foreground/10 focus-visible:ring-ring/50 overflow-hidden rounded-xl text-left ring-1 transition-colors focus-visible:ring-3 focus-visible:outline-none",
              selected ? "ring-primary bg-primary/10 ring-2" : "bg-muted/30 hover:bg-muted/60",
            )}
          >
            <span className="relative block aspect-video">
              <AssetImage src={game.cardImage} alt="" fill className="object-cover" />

              {selected ? (
                <span className="bg-primary text-primary-foreground absolute top-2 right-2 grid size-6 place-content-center rounded-full">
                  <CheckIcon className="size-3.5" />
                </span>
              ) : null}
            </span>

            <span className="block p-2.5">
              <span className="block truncate text-sm font-medium">{game.title}</span>

              <span
                className={cn(
                  "block text-xs",
                  competitors < MIN_TEAMS_PER_MATCH ? "text-brand-gold" : "text-muted-foreground",
                )}
              >
                {competitors < MIN_TEAMS_PER_MATCH
                  ? `Only ${competitors} competitor${competitors === 1 ? "" : "s"} — you'll add more`
                  : `${competitors} competitors ready`}
              </span>

              {game.status !== "active" ? (
                <span className="text-muted-foreground block text-xs">Hidden from the lobby</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Step 2 — competitors
 * ------------------------------------------------------------------ */

function TeamStep({
  game,
  teams,
  selected,
  onToggle,
  canAddCompetitors,
  onCreated,
}: {
  game: SetupGame;
  teams: SetupTeam[];
  selected: string[];
  onToggle: (id: string) => void;
  canAddCompetitors: boolean;
  onCreated: (team: SetupTeam) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Tap everything running in this event — {MIN_TEAMS_PER_MATCH} to {MAX_TEAMS_PER_MATCH} of
        them. Missing one? Add it here without losing your place.
      </p>

      {teams.length === 0 ? (
        <div className="border-border grid place-items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center">
          <UsersRoundIcon className="text-muted-foreground size-6" />
          <p className="text-sm font-medium">{game.title} has no competitors yet.</p>
          <p className="text-muted-foreground text-sm">
            Add at least {MIN_TEAMS_PER_MATCH} — a turtle, a lane, a door, whatever players are
            picking between.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {teams.map((team) => {
            const isSelected = selected.includes(team.id);
            const full = !isSelected && selected.length >= MAX_TEAMS_PER_MATCH;

            return (
              <button
                key={team.id}
                type="button"
                aria-pressed={isSelected}
                disabled={full}
                onClick={() => onToggle(team.id)}
                className={cn(
                  "flex min-h-12 items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : full
                      ? "border-border opacity-40"
                      : "border-border hover:bg-muted",
                )}
              >
                <AssetImage
                  src={team.image}
                  alt=""
                  width={TEAM_IMAGE_SIZE}
                  height={TEAM_IMAGE_SIZE}
                  className="size-8 shrink-0 rounded-full object-cover"
                />

                <span className="min-w-0 flex-1 truncate">
                  {team.name}
                  {team.status === "inactive" ? (
                    <span className="text-muted-foreground text-xs"> · hidden</span>
                  ) : null}
                </span>

                {isSelected ? <CheckIcon className="text-primary size-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {canAddCompetitors ? (
          <QuickTeamDialog
            categoryId={game.id}
            gameTitle={game.title}
            onCreated={onCreated}
            disabled={selected.length >= MAX_TEAMS_PER_MATCH}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            You don&apos;t have permission to add competitors — ask an admin.
          </p>
        )}

        <p className="text-muted-foreground text-sm">
          {selected.length} picked
          {selected.length >= MAX_TEAMS_PER_MATCH ? " · that's the maximum" : ""}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Step 3 — name and time
 * ------------------------------------------------------------------ */

function DetailsStep({
  title,
  suggestion,
  onTitle,
  startIso,
  startsInThePast,
  onStart,
  series,
  seriesId,
  onSeries,
}: {
  title: string;
  suggestion: string;
  onTitle: (value: string) => void;
  startIso: string;
  startsInThePast: boolean;
  onStart: (iso: string) => void;
  series: { id: string; title: string }[];
  seriesId: string;
  onSeries: (id: string) => void;
}) {
  return (
    <div className="grid max-w-2xl gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="wizard-title">Event name</Label>

        <Input
          id="wizard-title"
          value={title}
          maxLength={140}
          placeholder={suggestion || "Heat 3 — Turtle A vs Turtle B"}
          onChange={(event) => onTitle(event.target.value)}
          className="h-11 md:h-10"
        />

        <p className="text-muted-foreground text-xs">
          This is what players see in the lobby.
          {suggestion && title !== suggestion ? (
            <>
              {" "}
              <button
                type="button"
                onClick={() => onTitle(suggestion)}
                className="text-primary hover:underline"
              >
                Use &ldquo;{suggestion}&rdquo;
              </button>
            </>
          ) : null}
        </p>
      </div>

      <div className="grid gap-2">
        {/* Controlled, so the presets below can write into it. Nothing here
            posts through FormData — the wizard sends one JSON payload. */}
        <DateTimeField
          label="Starts"
          name="wizard-start"
          value={startIso}
          onValueChange={onStart}
          hint="Betting closes at this moment unless you say otherwise"
        />

        <div className="flex flex-wrap gap-2">
          {START_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onStart(preset.compute().toISOString())}
            >
              <ClockIcon />
              {preset.label}
            </Button>
          ))}
        </div>

        {startsInThePast ? (
          <p className="text-brand-gold flex items-start gap-2 text-xs">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
            That time has already passed, so betting will close the moment this goes live.
          </p>
        ) : null}
      </div>

      {series.length > 0 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="wizard-series">Part of a series? (optional)</Label>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={seriesId === "" ? "default" : "outline"}
              size="sm"
              onClick={() => onSeries("")}
            >
              On its own
            </Button>

            {series.map((entry) => (
              <Button
                key={entry.id}
                type="button"
                variant={seriesId === entry.id ? "default" : "outline"}
                size="sm"
                onClick={() => onSeries(entry.id)}
              >
                {entry.title}
              </Button>
            ))}
          </div>

          <p className="text-muted-foreground text-xs">
            Only matters for grouping events together. Leave it alone if you&apos;re not sure.
          </p>
        </div>
      ) : null}
    </div>
  );
}

const START_PRESETS: { label: string; compute: () => Date }[] = [
  { label: "In 1 hour", compute: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: "In 3 hours", compute: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
  { label: "Tonight, 8pm", compute: () => atHour(0, 20) },
  { label: "Tomorrow, 8pm", compute: () => atHour(1, 20) },
];

function atHour(daysAhead: number, hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  return date;
}

/* ------------------------------------------------------------------ *
 * Step 4 — betting questions
 * ------------------------------------------------------------------ */

function QuestionStep({
  game,
  picked,
  roster,
  questions,
  startIso,
  onPatch,
  onAdd,
  onRemove,
}: {
  game: SetupGame;
  picked: SetupTeam[];
  /** Every competitor in this game, not just the ones in this event. */
  roster: SetupTeam[];
  questions: DraftQuestion[];
  startIso: string;
  onPatch: (key: string, patch: Partial<DraftQuestion>) => void;
  onAdd: (question: DraftQuestion) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Each question is one thing players bet on. The payout is how much a winning bet returns —
        set it to 2 and a 100-coin bet pays 200.
      </p>

      {game.templates.length > 0 ? (
        <div className="bg-muted/40 space-y-2 rounded-lg p-3">
          <p className="text-sm font-medium">Ready-made questions for {game.title}</p>

          <div className="flex flex-wrap gap-2">
            {game.templates.map((template, index) => (
              <Button
                key={index}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAdd(fromTemplate(template, picked, roster))}
              >
                <SparklesIcon />
                {template.question}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {questions.map((question, index) => (
        <QuestionCard
          key={question.key}
          index={index}
          question={question}
          picked={picked}
          startIso={startIso}
          onPatch={onPatch}
          onRemove={questions.length > 1 ? () => onRemove(question.key) : undefined}
        />
      ))}

      <Button type="button" variant="outline" size="lg" onClick={() => onAdd(blankQuestion(picked))}>
        <PlusIcon />
        Add another question
      </Button>
    </div>
  );
}

function QuestionCard({
  index,
  question,
  picked,
  startIso,
  onPatch,
  onRemove,
}: {
  index: number;
  question: DraftQuestion;
  picked: SetupTeam[];
  startIso: string;
  onPatch: (key: string, patch: Partial<DraftQuestion>) => void;
  onRemove?: () => void;
}) {
  function patchAnswer(answerKey: string, patch: Partial<DraftAnswer>) {
    onPatch(question.key, {
      answers: question.answers.map((answer) =>
        answer.key === answerKey ? { ...answer, ...patch } : answer,
      ),
    });
  }

  const canUseCompetitors =
    picked.length >= MIN_OPTIONS_PER_QUESTION &&
    picked.length <= MAX_OPTIONS_PER_QUESTION &&
    !sameNames(question.answers, picked);

  return (
    <div className="ring-foreground/10 space-y-4 rounded-xl p-4 ring-1">
      <div className="flex items-start gap-3">
        <span className="bg-muted text-muted-foreground mt-1.5 grid size-6 shrink-0 place-content-center rounded-full text-xs font-semibold">
          {index + 1}
        </span>

        <div className="grid flex-1 gap-1.5">
          <Label htmlFor={`question-${question.key}`}>What are they betting on?</Label>

          <Input
            id={`question-${question.key}`}
            value={question.text}
            maxLength={200}
            placeholder="Which lane finishes first?"
            onChange={(event) => onPatch(question.key, { text: event.target.value })}
            className="h-11 md:h-10"
          />
        </div>

        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="mt-6"
            aria-label={`Remove question ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>

      <div className="space-y-2 pl-0 sm:pl-9">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Answers players can pick</Label>

          {canUseCompetitors ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onPatch(question.key, { answers: answersFromCompetitors(picked) })
              }
            >
              <WandSparklesIcon />
              Use the competitors
            </Button>
          ) : null}
        </div>

        {question.answers.map((answer, answerIndex) => {
          const ratio = Number(answer.ratio);

          return (
            <div key={answer.key} className="space-y-1.5">
              {/* The name takes the full width on a phone and shares the row
                  from `sm` up: 128px is not enough to read "60 to 120 seconds"
                  back, and the payout beside it can't shrink much further. */}
              <div className="grid grid-cols-[1fr_2.25rem] items-center gap-2 sm:grid-cols-[1fr_7rem_2.25rem]">
                <Input
                  value={answer.name}
                  maxLength={80}
                  placeholder={`Answer ${answerIndex + 1}`}
                  aria-label={`Answer ${answerIndex + 1}`}
                  onChange={(event) => patchAnswer(answer.key, { name: event.target.value })}
                  className="col-span-2 h-11 sm:col-span-1 md:h-10"
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
                    value={answer.ratio}
                    aria-label={`Payout for answer ${answerIndex + 1}`}
                    onChange={(event) => patchAnswer(answer.key, { ratio: event.target.value })}
                    className="h-11 pl-6 md:h-10"
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Remove answer ${answerIndex + 1}`}
                  disabled={question.answers.length <= MIN_OPTIONS_PER_QUESTION}
                  onClick={() =>
                    onPatch(question.key, {
                      answers: question.answers.filter((row) => row.key !== answer.key),
                    })
                  }
                >
                  <Trash2Icon />
                </Button>
              </div>

              <p className="text-muted-foreground pl-0.5 text-xs">
                {payoutExample(ratio)}
                {payoutFeel(ratio) ? ` · ${payoutFeel(ratio)}` : ""}
              </p>
            </div>
          );
        })}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={question.answers.length >= MAX_OPTIONS_PER_QUESTION}
            onClick={() =>
              onPatch(question.key, {
                answers: [...question.answers, blankAnswer(evenRatioFor(question.answers.length + 1))],
              })
            }
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
              onClick={() =>
                onPatch(question.key, {
                  answers: question.answers.map((answer) => ({
                    ...answer,
                    ratio: String(preset.ratio),
                  })),
                })
              }
            >
              ×{preset.ratio}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2 pl-0 sm:pl-9">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-muted-foreground text-xs font-normal">Betting closes:</Label>

          <Button
            type="button"
            variant={question.closesAtStart ? "default" : "outline"}
            size="sm"
            onClick={() => onPatch(question.key, { closesAtStart: true })}
          >
            When the event starts
          </Button>

          <Button
            type="button"
            variant={question.closesAtStart ? "outline" : "default"}
            size="sm"
            onClick={() =>
              onPatch(question.key, { closesAtStart: false, closesAt: question.closesAt || startIso })
            }
          >
            A different time
          </Button>
        </div>

        {!question.closesAtStart ? (
          <DateTimeField
            label="Closes at"
            name={`close-${question.key}`}
            value={question.closesAt}
            onValueChange={(iso) => onPatch(question.key, { closesAt: iso })}
            className="max-w-xs"
          />
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Step 5 — review
 * ------------------------------------------------------------------ */

function ReviewStep({
  game,
  picked,
  title,
  startIso,
  seriesTitle,
  questions,
  openForBetting,
  onOpenForBetting,
  onJump,
}: {
  game: SetupGame;
  picked: SetupTeam[];
  title: string;
  startIso: string;
  seriesTitle: string | null;
  questions: DraftQuestion[];
  openForBetting: boolean;
  onOpenForBetting: (value: boolean) => void;
  onJump: (step: StepIndex) => void;
}) {
  return (
    <div className="space-y-5">
      <dl className="grid gap-3 sm:grid-cols-2">
        <ReviewRow label="Game" onEdit={() => onJump(0)}>
          {game.title}
        </ReviewRow>

        <ReviewRow label="Name" onEdit={() => onJump(2)}>
          {title || <span className="text-destructive">Not set</span>}
        </ReviewRow>

        <ReviewRow label="Starts" onEdit={() => onJump(2)}>
          {startIso ? <LocalTime value={startIso} /> : <span className="text-destructive">Not set</span>}
        </ReviewRow>

        <ReviewRow label="Competitors" onEdit={() => onJump(1)}>
          <span className="flex flex-wrap items-center gap-1.5">
            {picked.map((team) => (
              <span key={team.id} className="inline-flex items-center gap-1.5">
                <AssetImage
                  src={team.image}
                  alt=""
                  width={TEAM_IMAGE_SIZE}
                  height={TEAM_IMAGE_SIZE}
                  className="size-5 rounded-full object-cover"
                />
                {team.name}
              </span>
            ))}
          </span>
        </ReviewRow>

        {seriesTitle ? <ReviewRow label="Series">{seriesTitle}</ReviewRow> : null}
      </dl>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {questions.length} betting question{questions.length === 1 ? "" : "s"}
          </p>

          <button
            type="button"
            onClick={() => onJump(3)}
            className="text-primary text-sm hover:underline"
          >
            Edit
          </button>
        </div>

        <ul className="space-y-2">
          {questions.map((question) => (
            <li key={question.key} className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
              <p className="font-medium">{question.text || "—"}</p>

              <p className="text-muted-foreground text-xs">
                {question.answers
                  .map((answer) => `${answer.name || "—"} ×${answer.ratio}`)
                  .join("  ·  ")}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">When this is created…</legend>

        <div className="grid gap-2 sm:grid-cols-2">
          <PublishChoice
            selected={openForBetting}
            onSelect={() => onOpenForBetting(true)}
            title="Open betting straight away"
            description="Players see it in the lobby and can bet immediately."
          />

          <PublishChoice
            selected={!openForBetting}
            onSelect={() => onOpenForBetting(false)}
            title="Set it up, don't open yet"
            description="Everything is saved with betting closed. Open it from the events list when you're ready."
          />
        </div>
      </fieldset>
    </div>
  );
}

function ReviewRow({
  label,
  children,
  onEdit,
}: {
  label: string;
  children: React.ReactNode;
  onEdit?: () => void;
}) {
  return (
    <div className="bg-muted/40 rounded-lg px-3 py-2">
      <dt className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        {label}
        {onEdit ? (
          <button type="button" onClick={onEdit} className="text-primary hover:underline">
            Change
          </button>
        ) : null}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function PublishChoice({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {selected ? <CheckIcon className="text-primary size-4" /> : null}
        {title}
      </span>
      <span className="text-muted-foreground mt-0.5 block text-xs">{description}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * The stepper
 * ------------------------------------------------------------------ */

function Stepper({ step, onJump }: { step: StepIndex; onJump: (step: StepIndex) => void }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {STEPS.map((entry, index) => {
        const done = index < step;
        const current = index === step;

        return (
          <li key={entry.key} className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={index > step}
              onClick={() => onJump(index as StepIndex)}
              aria-current={current ? "step" : undefined}
              className={cn(
                // `touch-target` is the project's 44px floor (7.4). These are
                // raw buttons rather than `Button`, so it has to be asked for.
                "touch-target flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                current
                  ? "bg-primary/15 text-primary"
                  : done
                    ? "text-muted-foreground hover:bg-muted"
                    : "text-muted-foreground/50",
              )}
            >
              <span
                className={cn(
                  "grid size-4.5 shrink-0 place-content-center rounded-full text-[10px] font-bold",
                  current
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <CheckIcon className="size-2.5" /> : index + 1}
              </span>
              {entry.title}
            </button>

            {index < STEPS.length - 1 ? (
              <span className="bg-border h-px w-3 sm:w-5" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ *
 * Drafting helpers
 * ------------------------------------------------------------------ */

let sequence = 0;
function nextKey(): string {
  sequence += 1;
  return `k${sequence}`;
}

function blankAnswer(ratio: number): DraftAnswer {
  return { key: nextKey(), name: "", ratio: String(ratio) };
}

function answersFromCompetitors(picked: SetupTeam[]): DraftAnswer[] {
  const ratio = String(evenRatioFor(picked.length));
  return picked.map((team) => ({ key: nextKey(), name: team.name, ratio }));
}

function blankQuestion(picked: SetupTeam[]): DraftQuestion {
  const usable = picked.length >= MIN_OPTIONS_PER_QUESTION && picked.length <= MAX_OPTIONS_PER_QUESTION;

  return {
    key: nextKey(),
    text: "",
    answers: usable
      ? answersFromCompetitors(picked)
      : [blankAnswer(2), blankAnswer(2)],
    closesAtStart: true,
    closesAt: "",
  };
}

function fromTemplate(
  template: { question: string; options: string[]; defaultRatio: number },
  picked: SetupTeam[],
  roster: SetupTeam[],
): DraftQuestion {
  const names = templateAnswerNames(template.options, picked, roster);

  const answers = names.slice(0, MAX_OPTIONS_PER_QUESTION).map((name) => ({
    key: nextKey(),
    name,
    ratio: String(template.defaultRatio),
  }));

  return {
    key: nextKey(),
    text: template.question,
    answers: answers.length >= MIN_OPTIONS_PER_QUESTION ? answers : [blankAnswer(2), blankAnswer(2)],
    closesAtStart: true,
    closesAt: "",
  };
}

/**
 * Which answers a template should actually produce.
 *
 * A template like "Which lane wins?" lists every lane the *game* has, because
 * that is all it can know when it is written. But this event is only running
 * three of them, and offering a bet on a lane that is not in the race is a
 * question nobody can settle honestly — the old flow's most likely silent
 * mistake, since the names look perfectly plausible.
 *
 * So: if every option the template names is a competitor in this game, the
 * template is asking "which competitor?" and the answer is the ones actually
 * taking part. Anything else — Yes/No, Under/Over, a hand-written list — is
 * left exactly as written.
 */
function templateAnswerNames(
  options: string[],
  picked: SetupTeam[],
  roster: SetupTeam[],
): string[] {
  const fallback = picked.map((team) => team.name);

  if (options.length < MIN_OPTIONS_PER_QUESTION) return fallback;

  const rosterNames = new Set(roster.map((team) => team.name.trim().toLowerCase()));
  const allAreCompetitors = options.every((option) =>
    rosterNames.has(option.trim().toLowerCase()),
  );

  if (!allAreCompetitors) return options;
  return fallback.length >= MIN_OPTIONS_PER_QUESTION ? fallback : options;
}

/** The game's presets, dropped in whole the first time the step is opened. */
function seedQuestions(
  game: SetupGame | null,
  picked: SetupTeam[],
  roster: SetupTeam[],
): DraftQuestion[] {
  if (!game || game.templates.length === 0) return [blankQuestion(picked)];
  return game.templates.slice(0, 3).map((template) => fromTemplate(template, picked, roster));
}

function suggestName(game: SetupGame | null, picked: SetupTeam[]): string {
  if (!game) return "";
  if (picked.length === 0) return game.title;
  if (picked.length === 2) return `${game.title} — ${picked[0]!.name} vs ${picked[1]!.name}`;
  return `${game.title} — ${picked.length} competitors`;
}

function sameNames(answers: DraftAnswer[], picked: SetupTeam[]): boolean {
  if (answers.length !== picked.length) return false;
  return answers.every((answer, index) => answer.name === picked[index]!.name);
}
