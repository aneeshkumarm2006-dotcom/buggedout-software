"use client";

import { useActionState, useState } from "react";
import { CheckIcon } from "lucide-react";

import { DateTimeField } from "@/components/admin/date-time-field";
import {
  FieldRow,
  FormActions,
  FormAlert,
  FormCard,
  TextField,
  useFormToast,
} from "@/components/admin/form-parts";
import { AssetImage } from "@/components/common/asset-image";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CategoryOption } from "@/lib/admin/categories";
import type { MatchDetail } from "@/lib/admin/matches";
import type { TeamOption } from "@/lib/admin/teams";
import type { TournamentOption } from "@/lib/admin/tournaments";
import {
  EDITABLE_MATCH_STATUSES,
  MAX_TEAMS_PER_MATCH,
  MIN_TEAMS_PER_MATCH,
  TEAM_IMAGE_SIZE,
} from "@/lib/enums";
import { fieldError, idleFormState, type FormState } from "@/lib/form";
import { cn } from "@/lib/utils";

/**
 * The match builder (Phase 6.7).
 *
 * The three pickers depend on each other: choose a game and only that game's
 * tournaments and teams stay selectable. The whole catalogue is sent down once
 * and filtered in the browser — with ten games and a roster each, that is a few
 * kilobytes and no round trip per keystroke.
 *
 * The selects don't carry `name` themselves; each writes into an explicit
 * hidden input instead, so "no tournament" posts an empty string rather than a
 * sentinel the schema would have to know about.
 */
const NO_TOURNAMENT = "__none__";

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming — open for betting",
  live: "Live — running now",
  locked: "Locked — no new bets",
  resolved: "Resolved — finished",
};

export function MatchForm({
  action,
  categories,
  tournaments,
  teams,
  match,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  categories: CategoryOption[];
  tournaments: TournamentOption[];
  teams: TeamOption[];
  match?: MatchDetail;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleFormState);
  useFormToast(state);

  const [categoryId, setCategoryId] = useState(match?.categoryId ?? "");
  const [tournamentId, setTournamentId] = useState(match?.tournamentId ?? NO_TOURNAMENT);
  const [teamIds, setTeamIds] = useState<string[]>(match?.teamIds ?? []);

  const categoryTournaments = tournaments.filter((t) => t.categoryId === categoryId);
  const categoryTeams = teams.filter((team) => team.categoryId === categoryId);

  const categoryFrozen = !!match?.hasBets;
  const teamsError = fieldError(state, "teamIds");

  function pickCategory(next: string) {
    setCategoryId(next);
    // A tournament or team from the old game would fail validation anyway;
    // clearing them makes that obvious before the submit rather than after.
    setTournamentId(NO_TOURNAMENT);
    setTeamIds([]);
  }

  return (
    <form action={formAction} className="grid max-w-3xl gap-4" noValidate>
      <FormAlert state={state} />

      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="tournamentId" value={tournamentId === NO_TOURNAMENT ? "" : tournamentId} />
      <input type="hidden" name="teamIds" value={JSON.stringify(teamIds)} />

      <FormCard title="Match">
        <TextField
          label="Title"
          name="title"
          required
          maxLength={140}
          defaultValue={state.values?.title ?? match?.title ?? ""}
          error={fieldError(state, "title")}
          placeholder="Heat 3 — Turtle A vs Turtle B"
        />

        <FieldRow>
          <div className="grid gap-1.5">
            <Label htmlFor="match-category">Game</Label>

            <Select value={categoryId} onValueChange={pickCategory} disabled={categoryFrozen}>
              <SelectTrigger id="match-category" className="h-11 w-full md:h-10">
                <SelectValue placeholder="Pick a game" />
              </SelectTrigger>

              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.status === "active" ? category.title : `${category.title} (inactive)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {fieldError(state, "categoryId") ? (
              <p className="text-destructive text-xs">{fieldError(state, "categoryId")}</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {categoryFrozen
                  ? "Locked — this match already has bets, which record the game they were placed in."
                  : "Decides which tournaments and teams you can pick."}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="match-tournament">Tournament</Label>

            <Select
              value={tournamentId}
              onValueChange={setTournamentId}
              disabled={!categoryId || categoryTournaments.length === 0}
            >
              <SelectTrigger id="match-tournament" className="h-11 w-full md:h-10">
                <SelectValue placeholder="Standalone match" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value={NO_TOURNAMENT}>No tournament</SelectItem>
                {categoryTournaments.map((tournament) => (
                  <SelectItem key={tournament.id} value={tournament.id}>
                    {tournament.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {fieldError(state, "tournamentId") ? (
              <p className="text-destructive text-xs">{fieldError(state, "tournamentId")}</p>
            ) : (
              <p className="text-muted-foreground text-xs">Optional.</p>
            )}
          </div>
        </FieldRow>

        <FieldRow>
          <DateTimeField
            label="Start time"
            name="startTime"
            required
            defaultValue={state.values?.startTime ?? match?.startTime ?? ""}
            error={fieldError(state, "startTime")}
          />

          <div className="grid gap-1.5">
            <Label htmlFor="match-status">Status</Label>

            <Select name="status" defaultValue={state.values?.status || match?.status || "upcoming"}>
              <SelectTrigger id="match-status" className="h-11 w-full md:h-10">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {EDITABLE_MATCH_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {fieldError(state, "status") ? (
              <p className="text-destructive text-xs">{fieldError(state, "status")}</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Cancelling is a separate action — it refunds every open stake.
              </p>
            )}
          </div>
        </FieldRow>
      </FormCard>

      <FormCard
        title="Teams"
        description={`Between ${MIN_TEAMS_PER_MATCH} and ${MAX_TEAMS_PER_MATCH}, all from the same game.`}
      >
        {!categoryId ? (
          <p className="text-muted-foreground text-sm">Pick a game first.</p>
        ) : categoryTeams.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            That game has no teams yet — add some before building a match for it.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categoryTeams.map((team) => {
                const selected = teamIds.includes(team.id);

                return (
                  <button
                    key={team.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setTeamIds((current) =>
                        selected
                          ? current.filter((id) => id !== team.id)
                          : current.length >= MAX_TEAMS_PER_MATCH
                            ? current
                            : [...current, team.id],
                      )
                    }
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <AssetImage
                      src={team.image}
                      alt=""
                      width={TEAM_IMAGE_SIZE}
                      height={TEAM_IMAGE_SIZE}
                      className="size-7 shrink-0 rounded-full object-cover"
                    />

                    <span className="min-w-0 flex-1 truncate">
                      {team.name}
                      {team.status === "inactive" ? (
                        <span className="text-muted-foreground text-xs"> · inactive</span>
                      ) : null}
                    </span>

                    {selected ? <CheckIcon className="text-primary size-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>

            <p className={cn("text-xs", teamsError ? "text-destructive" : "text-muted-foreground")}>
              {teamsError ?? `${teamIds.length} selected.`}
            </p>
          </>
        )}
      </FormCard>

      <FormActions pending={pending} submitLabel={submitLabel} cancelHref="/admin/matches" />
    </form>
  );
}
