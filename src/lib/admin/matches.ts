import "server-only";

import { Types, type QueryFilter } from "mongoose";

import {
  ADMIN_PAGE_SIZE,
  pageSlice,
  searchRegex,
  totalPages,
  type Paged,
} from "@/lib/admin/list-params";
import { isValidObjectId, toObjectId, type MutationResult } from "@/lib/admin/shared";
import { connectDB } from "@/lib/db";
import {
  EDITABLE_MATCH_STATUSES,
  MAX_TEAMS_PER_MATCH,
  MIN_TEAMS_PER_MATCH,
  type MatchStatus,
} from "@/lib/enums";
import {
  Bet,
  GameCategory,
  Match,
  Question,
  Team,
  Tournament,
  type IGameCategory,
  type IMatch,
  type ITeam,
  type ITournament,
} from "@/models";
import type { CreateMatchInput, UpdateMatchInput } from "@/schemas/match";

/**
 * Matches, admin side (Phase 6.7).
 *
 * A match is where the whole catalogue meets: a game, optionally a tournament,
 * two to eight teams and a start time. Everything a user can bet on hangs off
 * it, which is why the writes here are so defensive — a match whose category no
 * longer matches its bets, or whose teams belong to a different game, would
 * quietly corrupt the leaderboard and the market list alike.
 */
export type MatchRow = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  tournamentTitle: string | null;
  teams: { id: string; name: string; image: string }[];
  startTime: string;
  status: MatchStatus;
  questionCount: number;
  openQuestionCount: number;
};

export type MatchDetail = {
  id: string;
  title: string;
  categoryId: string;
  tournamentId: string | null;
  teamIds: string[];
  startTime: string;
  status: MatchStatus;
  /** Locked down once money is on it — see `updateMatch`. */
  hasBets: boolean;
};

export type MatchListParams = {
  page?: number;
  q?: string;
  status?: MatchStatus;
  categoryId?: string;
  tournamentId?: string;
};

export async function listMatches(params: MatchListParams = {}): Promise<Paged<MatchRow>> {
  await connectDB();

  const { skip, limit } = pageSlice(params.page ?? 1);
  const filter: QueryFilter<IMatch> = {};

  if (params.status) filter.status = params.status;
  if (params.categoryId && isValidObjectId(params.categoryId)) {
    filter.categoryId = toObjectId(params.categoryId);
  }
  if (params.tournamentId && isValidObjectId(params.tournamentId)) {
    filter.tournamentId = toObjectId(params.tournamentId);
  }
  if (params.q) filter.title = searchRegex(params.q);

  const [total, matches] = await Promise.all([
    Match.countDocuments(filter),
    Match.find(filter).sort({ startTime: -1 }).skip(skip).limit(limit).lean<IMatch[]>(),
  ]);

  const [categories, tournaments, teams, questionCounts] = await Promise.all([
    GameCategory.find({ _id: { $in: matches.map((match) => match.categoryId) } })
      .select("title")
      .lean<Pick<IGameCategory, "_id" | "title">[]>(),
    Tournament.find({
      _id: { $in: matches.flatMap((match) => (match.tournamentId ? [match.tournamentId] : [])) },
    })
      .select("title")
      .lean<Pick<ITournament, "_id" | "title">[]>(),
    Team.find({ _id: { $in: matches.flatMap((match) => match.teamIds) } })
      .select("name image")
      .lean<Pick<ITeam, "_id" | "name" | "image">[]>(),
    Question.aggregate<{ _id: Types.ObjectId; total: number; open: number }>([
      { $match: { matchId: { $in: matches.map((match) => match._id) } } },
      {
        $group: {
          _id: "$matchId",
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $in: ["$status", ["active", "locked"]] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const categoryTitleById = new Map(categories.map((c) => [c._id.toString(), c.title]));
  const tournamentTitleById = new Map(tournaments.map((t) => [t._id.toString(), t.title]));
  const teamById = new Map(teams.map((team) => [team._id.toString(), team]));
  const questionsByMatch = new Map(questionCounts.map((row) => [row._id.toString(), row]));

  return {
    rows: matches.map((match) => {
      const counts = questionsByMatch.get(match._id.toString());

      return {
        id: match._id.toString(),
        title: match.title,
        categoryId: match.categoryId.toString(),
        categoryTitle: categoryTitleById.get(match.categoryId.toString()) ?? "Game removed",
        tournamentTitle: match.tournamentId
          ? (tournamentTitleById.get(match.tournamentId.toString()) ?? null)
          : null,
        teams: match.teamIds.flatMap((teamId) => {
          const team = teamById.get(teamId.toString());
          return team
            ? [{ id: team._id.toString(), name: team.name, image: team.image }]
            : [];
        }),
        startTime: match.startTime.toISOString(),
        status: match.status,
        questionCount: counts?.total ?? 0,
        openQuestionCount: counts?.open ?? 0,
      };
    }),
    page: params.page ?? 1,
    total,
    totalPages: totalPages(total, ADMIN_PAGE_SIZE),
  };
}

export async function getMatch(id: string): Promise<MatchDetail | null> {
  await connectDB();

  if (!isValidObjectId(id)) return null;

  const match = await Match.findById(toObjectId(id)).lean<IMatch>();
  if (!match) return null;

  const hasBets = !!(await Bet.exists({ matchId: match._id }));

  return {
    id: match._id.toString(),
    title: match.title,
    categoryId: match.categoryId.toString(),
    tournamentId: match.tournamentId?.toString() ?? null,
    teamIds: match.teamIds.map((teamId) => teamId.toString()),
    startTime: match.startTime.toISOString(),
    status: match.status,
    hasBets,
  };
}

/** Title and status for the question-list header (6.8). */
export type MatchHeader = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  startTime: string;
  status: MatchStatus;
};

export async function getMatchHeader(id: string): Promise<MatchHeader | null> {
  await connectDB();

  if (!isValidObjectId(id)) return null;

  const match = await Match.findById(toObjectId(id))
    .select("title categoryId startTime status")
    .lean<Pick<IMatch, "_id" | "title" | "categoryId" | "startTime" | "status">>();

  if (!match) return null;

  const category = await GameCategory.findById(match.categoryId)
    .select("title")
    .lean<Pick<IGameCategory, "_id" | "title">>();

  return {
    id: match._id.toString(),
    title: match.title,
    categoryId: match.categoryId.toString(),
    categoryTitle: category?.title ?? "Game removed",
    startTime: match.startTime.toISOString(),
    status: match.status,
  };
}

export async function createMatch(
  input: CreateMatchInput,
): Promise<MutationResult<{ id: string; title: string }>> {
  await connectDB();

  const validation = await validateMatchShape(input.categoryId, input.tournamentId, input.teamIds);
  if (validation) return validation;

  const match = await Match.create({
    title: input.title,
    categoryId: toObjectId(input.categoryId),
    tournamentId: input.tournamentId ? toObjectId(input.tournamentId) : null,
    teamIds: input.teamIds.map(toObjectId),
    startTime: input.startTime,
    status: input.status ?? "upcoming",
    streamUrl: input.streamUrl ?? null,
  });

  return { ok: true, data: { id: match._id.toString(), title: match.title } };
}

export async function updateMatch(
  id: string,
  input: UpdateMatchInput,
): Promise<MutationResult<{ id: string; title: string }>> {
  await connectDB();

  if (!isValidObjectId(id)) return { ok: false, message: "That match no longer exists." };

  const existing = await Match.findById(toObjectId(id)).lean<IMatch>();
  if (!existing) return { ok: false, message: "That match no longer exists." };

  if (input.status === "cancelled") {
    return {
      ok: false,
      field: "status",
      message: "Use Cancel match — it refunds every open stake. Setting the status alone would not.",
    };
  }

  const categoryId = input.categoryId ?? existing.categoryId.toString();

  // `Bet.categoryId` is a denormalised copy taken at placement (5.8 filters the
  // leaderboard on it). Moving the match to another game afterwards would leave
  // those bets pointing at the wrong one, and there is no honest way to rewrite
  // history, so the category is frozen once money is on it.
  if (input.categoryId && input.categoryId !== existing.categoryId.toString()) {
    const bets = await Bet.countDocuments({ matchId: existing._id });
    if (bets > 0) {
      return {
        ok: false,
        field: "categoryId",
        message: "This match already has bets on it, so it can't be moved to another game.",
      };
    }
  }

  const validation = await validateMatchShape(
    categoryId,
    input.tournamentId === undefined ? (existing.tournamentId?.toString() ?? null) : input.tournamentId,
    input.teamIds ?? existing.teamIds.map((teamId) => teamId.toString()),
  );
  if (validation) return validation;

  const changes: Record<string, unknown> = { ...input };
  if (input.teamIds) changes.teamIds = input.teamIds.map(toObjectId);
  if (input.categoryId) changes.categoryId = toObjectId(input.categoryId);
  if (input.tournamentId !== undefined) {
    changes.tournamentId = input.tournamentId ? toObjectId(input.tournamentId) : null;
  }

  const updated = await Match.findByIdAndUpdate(
    existing._id,
    { $set: changes },
    { returnDocument: "after", runValidators: true },
  ).lean<IMatch>();

  if (!updated) return { ok: false, message: "That match no longer exists." };

  return { ok: true, data: { id: updated._id.toString(), title: updated.title } };
}

/** The quick lock/unlock on a match row — a status flip, nothing more. */
export async function setMatchStatus(
  id: string,
  status: MatchStatus,
): Promise<MutationResult<{ title: string; status: MatchStatus }>> {
  await connectDB();

  if (!isValidObjectId(id)) return { ok: false, message: "That match no longer exists." };

  if (!EDITABLE_MATCH_STATUSES.includes(status)) {
    return { ok: false, message: "Cancelling a match has to go through Cancel — it refunds stakes." };
  }

  const updated = await Match.findOneAndUpdate(
    { _id: toObjectId(id), status: { $ne: "cancelled" } },
    { $set: { status } },
    { returnDocument: "after" },
  ).lean<IMatch>();

  if (!updated) {
    const exists = await Match.exists({ _id: toObjectId(id) });
    return {
      ok: false,
      message: exists
        ? "This match was cancelled — its status can't be changed back."
        : "That match no longer exists.",
    };
  }

  return { ok: true, data: { title: updated.title, status: updated.status } };
}

/**
 * Deleting takes the match's markets with it, which is only safe while nobody
 * has staked anything on them. Once a bet exists the match is part of a user's
 * history and can be cancelled, but not erased.
 */
export async function deleteMatch(id: string): Promise<MutationResult<{ title: string }>> {
  await connectDB();

  if (!isValidObjectId(id)) return { ok: false, message: "That match no longer exists." };

  const matchId = toObjectId(id);

  const match = await Match.findById(matchId).select("title").lean<Pick<IMatch, "_id" | "title">>();
  if (!match) return { ok: false, message: "That match no longer exists." };

  const bets = await Bet.countDocuments({ matchId });

  if (bets > 0) {
    return {
      ok: false,
      message: `${match.title} has ${bets} bet${bets === 1 ? "" : "s"} on it and can't be deleted. Cancel it instead — that refunds every open stake.`,
    };
  }

  await Question.deleteMany({ matchId });
  await Match.deleteOne({ _id: matchId });

  return { ok: true, data: { title: match.title } };
}

/**
 * The rules a match has to satisfy whichever way it was written: a real game, a
 * tournament from that same game, and 2–8 distinct teams that all belong to it.
 */
async function validateMatchShape(
  categoryId: string,
  tournamentId: string | null | undefined,
  teamIds: string[],
): Promise<MutationResult<never> | null> {
  if (!isValidObjectId(categoryId)) {
    return { ok: false, field: "categoryId", message: "Pick a game." };
  }

  const category = await GameCategory.exists({ _id: toObjectId(categoryId) });
  if (!category) return { ok: false, field: "categoryId", message: "Pick a game that exists." };

  if (tournamentId) {
    const tournament = await Tournament.findById(toObjectId(tournamentId))
      .select("categoryId")
      .lean<Pick<ITournament, "_id" | "categoryId">>();

    if (!tournament) {
      return { ok: false, field: "tournamentId", message: "That tournament no longer exists." };
    }

    if (tournament.categoryId.toString() !== categoryId) {
      return {
        ok: false,
        field: "tournamentId",
        message: "That tournament belongs to a different game.",
      };
    }
  }

  const uniqueTeamIds = [...new Set(teamIds)];

  if (uniqueTeamIds.length !== teamIds.length) {
    return { ok: false, field: "teamIds", message: "A team can only be picked once." };
  }

  if (
    uniqueTeamIds.length < MIN_TEAMS_PER_MATCH ||
    uniqueTeamIds.length > MAX_TEAMS_PER_MATCH
  ) {
    return {
      ok: false,
      field: "teamIds",
      message: `Pick between ${MIN_TEAMS_PER_MATCH} and ${MAX_TEAMS_PER_MATCH} teams.`,
    };
  }

  const teams = await Team.find({ _id: { $in: uniqueTeamIds.map(toObjectId) } })
    .select("categoryId")
    .lean<Pick<ITeam, "_id" | "categoryId">[]>();

  if (teams.length !== uniqueTeamIds.length) {
    return { ok: false, field: "teamIds", message: "One of those teams no longer exists." };
  }

  if (teams.some((team) => team.categoryId.toString() !== categoryId)) {
    return {
      ok: false,
      field: "teamIds",
      message: "Every team has to belong to the game the match is in.",
    };
  }

  return null;
}
