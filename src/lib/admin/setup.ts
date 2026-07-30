import "server-only";

import { isValidObjectId, toObjectId, type MutationResult } from "@/lib/admin/shared";
import { connectDB } from "@/lib/db";
import type { ContentStatus } from "@/lib/enums";
import {
  GameCategory,
  Match,
  Question,
  SupportTicket,
  Team,
  Tournament,
  type IGameCategory,
  type IMatch,
  type ITeam,
  type ITournament,
} from "@/models";
import type { EventSetupInput } from "@/schemas/event-setup";

/**
 * The guided event builder, server side.
 *
 * The panel's original shape is one screen per table — games, then series, then
 * competitors, then the match, then its markets — which is exactly the order
 * the *database* needs and roughly the opposite of how anybody thinks about the
 * job. Putting an event live meant five screens, in a fixed order, and
 * abandoning a half-filled form the moment a competitor turned out to be
 * missing.
 *
 * This module backs one screen that does all of it: read the whole catalogue in
 * one go (§`getSetupCatalogue`), then write the match and every question it
 * needs in one submit (§`createEventWithQuestions`).
 *
 * Nothing here loosens a rule. It calls the same models with the same
 * validation the individual screens do, and those screens all still work —
 * this is an additional way through, not a replacement for the precise one.
 */
export type SetupGame = {
  id: string;
  title: string;
  cardImage: string;
  status: ContentStatus;
  /** The preset questions this game offers, copied by value onto a new event. */
  templates: { question: string; options: string[]; defaultRatio: number }[];
};

export type SetupTeam = {
  id: string;
  name: string;
  image: string;
  categoryId: string;
  status: ContentStatus;
};

export type SetupSeries = {
  id: string;
  title: string;
  categoryId: string;
};

export type SetupCatalogue = {
  games: SetupGame[];
  teams: SetupTeam[];
  series: SetupSeries[];
};

/**
 * Everything the builder's four steps need, in three queries.
 *
 * Sent down whole rather than fetched per step: ten games with a roster each is
 * a few kilobytes, and the alternative is a round trip every time somebody
 * changes their mind about which game they are building for.
 */
export async function getSetupCatalogue(): Promise<SetupCatalogue> {
  await connectDB();

  const [games, teams, series] = await Promise.all([
    GameCategory.find({})
      .select("title cardImage status sortOrder marketTemplates")
      .sort({ sortOrder: 1, title: 1 })
      .lean<IGameCategory[]>(),
    Team.find({})
      .select("name image categoryId status")
      .sort({ name: 1 })
      .lean<Pick<ITeam, "_id" | "name" | "image" | "categoryId" | "status">[]>(),
    Tournament.find({ status: { $in: ["upcoming", "ongoing"] } })
      .select("title categoryId")
      .sort({ startDate: -1 })
      .lean<Pick<ITournament, "_id" | "title" | "categoryId">[]>(),
  ]);

  return {
    games: games.map((game) => ({
      id: game._id.toString(),
      title: game.title,
      cardImage: game.cardImage,
      status: game.status,
      templates: game.marketTemplates.map((template) => ({
        question: template.question,
        options: [...template.options],
        defaultRatio: template.defaultRatio,
      })),
    })),
    teams: teams.map((team) => ({
      id: team._id.toString(),
      name: team.name,
      image: team.image,
      categoryId: team.categoryId.toString(),
      status: team.status,
    })),
    series: series.map((tournament) => ({
      id: tournament._id.toString(),
      title: tournament.title,
      categoryId: tournament.categoryId.toString(),
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Writing the whole event
 * ------------------------------------------------------------------ */

export type CreatedEvent = {
  matchId: string;
  title: string;
  questionCount: number;
  /** Questions the database refused, by their position in the form. */
  rejected: { index: number; text: string; message: string }[];
};

/**
 * Creates the match and its questions.
 *
 * Not one transaction, and that is a decision rather than an omission: the
 * match is the thing worth keeping. If question three is rejected, an admin who
 * still has an event with questions one, two and four on it has lost thirty
 * seconds; an admin whose whole event vanished has lost the lot and has no idea
 * which field was wrong. So the match is written first, every question is
 * attempted, and whatever was refused comes back named so it can be fixed on
 * the question screen — which the caller sends them straight to.
 *
 * The shape is validated up front by `eventSetupSchema`, so a rejection here is
 * a *database* refusal (a competitor from the wrong game, a series that was
 * deleted mid-form) rather than a typo.
 */
export async function createEventWithQuestions(
  input: EventSetupInput,
): Promise<MutationResult<CreatedEvent>> {
  await connectDB();

  const category = await GameCategory.exists({ _id: toObjectId(input.categoryId) });
  if (!category) return { ok: false, field: "categoryId", message: "Pick a game that exists." };

  if (input.tournamentId) {
    const tournament = await Tournament.findById(toObjectId(input.tournamentId))
      .select("categoryId")
      .lean<Pick<ITournament, "_id" | "categoryId">>();

    if (!tournament) {
      return { ok: false, field: "tournamentId", message: "That series no longer exists." };
    }

    if (tournament.categoryId.toString() !== input.categoryId) {
      return {
        ok: false,
        field: "tournamentId",
        message: "That series belongs to a different game.",
      };
    }
  }

  const teams = await Team.find({ _id: { $in: input.teamIds.map(toObjectId) } })
    .select("categoryId")
    .lean<Pick<ITeam, "_id" | "categoryId">[]>();

  if (teams.length !== input.teamIds.length) {
    return { ok: false, field: "teamIds", message: "One of those competitors no longer exists." };
  }

  if (teams.some((team) => team.categoryId.toString() !== input.categoryId)) {
    return {
      ok: false,
      field: "teamIds",
      message: "Every competitor has to belong to the game you picked.",
    };
  }

  const match = await Match.create({
    title: input.title,
    categoryId: toObjectId(input.categoryId),
    tournamentId: input.tournamentId ? toObjectId(input.tournamentId) : null,
    teamIds: input.teamIds.map(toObjectId),
    startTime: input.startTime,
    // `locked` is the closest thing this model has to a draft: built, visible to
    // staff, taking no bets until somebody opens it from the event list.
    status: input.openForBetting ? "upcoming" : "locked",
    streamUrl: null,
  });

  const rejected: CreatedEvent["rejected"] = [];
  let created = 0;

  for (const [index, question] of input.questions.entries()) {
    const closesAt = question.closesAtStart ? input.startTime : question.closesAt;

    if (!closesAt) {
      rejected.push({
        index,
        text: question.text,
        message: "No closing time — set one on the question screen.",
      });
      continue;
    }

    try {
      await Question.create({
        matchId: match._id,
        text: question.text,
        options: question.options.map((option) => ({
          name: option.name,
          ratio: option.ratio,
          status: "active",
          isWinner: false,
        })),
        // A question on a closed event is closed too, or it would keep taking
        // bets on something the admin has deliberately not opened yet.
        status: input.openForBetting ? "active" : "locked",
        endDate: closesAt,
        minStakePerBet: DEFAULT_MIN_STAKE,
        maxStakePerBet: DEFAULT_MAX_STAKE,
      });

      created += 1;
    } catch (error) {
      console.error("[admin] guided setup: question rejected", error);
      rejected.push({
        index,
        text: question.text,
        message: "The database refused this one. Add it by hand from the event's questions.",
      });
    }
  }

  return {
    ok: true,
    data: {
      matchId: match._id.toString(),
      title: match.title,
      questionCount: created,
      rejected,
    },
  };
}

/** What the builder gives a question when it doesn't ask. Editable afterwards. */
const DEFAULT_MIN_STAKE = 10;
const DEFAULT_MAX_STAKE = 10_000;

/**
 * What the in-place "add a competitor" hands back — the created row, so the
 * picker that opened the dialog can select it without a round trip. Declared
 * here rather than beside the action because a `"use server"` module is only
 * allowed to export functions.
 */
export type QuickTeamResult =
  | { ok: true; team: { id: string; name: string; image: string; categoryId: string } }
  | { ok: false; message: string };

/* ------------------------------------------------------------------ *
 * "What needs me right now"
 * ------------------------------------------------------------------ */

export type AdminTasks = {
  /** Questions closed to betting with nobody paid yet — the money queue. */
  resultsWaiting: number;
  openTickets: number;
  /** Events open for betting that have no questions on them, so nobody can bet. */
  eventsWithoutQuestions: number;
  /** Open events starting inside the next 24 hours. */
  startingSoon: number;
  /** Games with fewer than two competitors — an event can't be built for them. */
  gamesWithoutCompetitors: number;
};

/**
 * The home screen's queues.
 *
 * Two of these are not in the original dashboard and are the ones that catch a
 * mistake rather than report a total: an event nobody can bet on because it has
 * no questions, and a game nobody can build an event for because it has fewer
 * than two competitors. Both are silent failures otherwise — everything looks
 * fine, and the lobby is simply empty.
 */
export async function getAdminTasks(): Promise<AdminTasks> {
  await connectDB();

  const now = new Date();
  const inADay = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [resultsWaiting, openTickets, openMatches, startingSoon, teamCounts, gameCount] =
    await Promise.all([
      Question.countDocuments({ status: "locked" }),
      SupportTicket.countDocuments({ status: { $ne: "closed" } }),
      Match.find({ status: { $in: ["upcoming", "live"] } })
        .select("_id")
        .lean<Pick<IMatch, "_id">[]>(),
      Match.countDocuments({
        status: { $in: ["upcoming", "live"] },
        startTime: { $gte: now, $lt: inADay },
      }),
      Team.aggregate<{ _id: unknown; count: number }>([
        { $match: { status: "active" } },
        { $group: { _id: "$categoryId", count: { $sum: 1 } } },
      ]),
      GameCategory.countDocuments({ status: "active" }),
    ]);

  const withQuestions = openMatches.length
    ? await Question.distinct("matchId", { matchId: { $in: openMatches.map((m) => m._id) } })
    : [];

  const hasQuestions = new Set(withQuestions.map((id) => String(id)));
  const readyGames = teamCounts.filter((row) => row.count >= 2).length;

  return {
    resultsWaiting,
    openTickets,
    eventsWithoutQuestions: openMatches.filter((m) => !hasQuestions.has(m._id.toString())).length,
    startingSoon,
    gamesWithoutCompetitors: Math.max(0, gameCount - readyGames),
  };
}

/** Whether the builder has anything to build with, for its empty state. */
export async function getSetupReadiness(): Promise<{
  gamesReady: number;
  gamesTotal: number;
}> {
  await connectDB();

  const [gamesTotal, teamCounts] = await Promise.all([
    GameCategory.countDocuments({}),
    Team.aggregate<{ _id: unknown; count: number }>([
      { $match: { status: "active" } },
      { $group: { _id: "$categoryId", count: { $sum: 1 } } },
    ]),
  ]);

  return {
    gamesTotal,
    gamesReady: teamCounts.filter((row) => row.count >= 2).length,
  };
}

/** Guards a caller that was handed an id from a query string. */
export function isSetupId(value: string | undefined | null): value is string {
  return isValidObjectId(value);
}
