import "server-only";

import type { QueryFilter } from "mongoose";

import {
  ADMIN_PAGE_SIZE,
  pageSlice,
  searchRegex,
  totalPages,
  type Paged,
} from "@/lib/admin/list-params";
import {
  duplicateKeyField,
  isValidObjectId,
  toObjectId,
  type MutationResult,
} from "@/lib/admin/shared";
import { connectDB } from "@/lib/db";
import type { ContentStatus } from "@/lib/enums";
import { GameCategory, Match, Team, type IGameCategory, type ITeam } from "@/models";
import type { CreateTeamInput, UpdateTeamInput } from "@/schemas/team";

/**
 * Teams, admin side (Phase 6.6). A team is a competitor in one game — turtle A,
 * lane 3, door 2 — and its 64×64 image is resized in the browser before it ever
 * reaches here, so `image` is only ever validated for shape.
 */
export type TeamRow = {
  id: string;
  name: string;
  image: string;
  categoryId: string;
  categoryTitle: string;
  status: ContentStatus;
  matchCount: number;
};

export type TeamDetail = {
  id: string;
  name: string;
  image: string;
  categoryId: string;
  status: ContentStatus;
};

export type TeamListParams = {
  page?: number;
  q?: string;
  status?: ContentStatus;
  categoryId?: string;
};

export async function listTeams(params: TeamListParams = {}): Promise<Paged<TeamRow>> {
  await connectDB();

  const { skip, limit } = pageSlice(params.page ?? 1);
  const filter: QueryFilter<ITeam> = {};

  if (params.status) filter.status = params.status;
  if (params.categoryId && isValidObjectId(params.categoryId)) {
    filter.categoryId = toObjectId(params.categoryId);
  }
  if (params.q) filter.name = searchRegex(params.q);

  const [total, teams] = await Promise.all([
    Team.countDocuments(filter),
    Team.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean<ITeam[]>(),
  ]);

  const [categories, matchCounts] = await Promise.all([
    GameCategory.find({ _id: { $in: teams.map((team) => team.categoryId) } })
      .select("title")
      .lean<Pick<IGameCategory, "_id" | "title">[]>(),
    Match.aggregate<{ _id: unknown; count: number }>([
      { $match: { teamIds: { $in: teams.map((team) => team._id) } } },
      { $unwind: "$teamIds" },
      { $group: { _id: "$teamIds", count: { $sum: 1 } } },
    ]),
  ]);

  const categoryTitleById = new Map(categories.map((c) => [c._id.toString(), c.title]));
  const matchCountById = new Map(matchCounts.map((row) => [String(row._id), row.count]));

  return {
    rows: teams.map((team) => ({
      id: team._id.toString(),
      name: team.name,
      image: team.image,
      categoryId: team.categoryId.toString(),
      categoryTitle: categoryTitleById.get(team.categoryId.toString()) ?? "Game removed",
      status: team.status,
      matchCount: matchCountById.get(team._id.toString()) ?? 0,
    })),
    page: params.page ?? 1,
    total,
    totalPages: totalPages(total, ADMIN_PAGE_SIZE),
  };
}

export async function getTeam(id: string): Promise<TeamDetail | null> {
  await connectDB();

  if (!isValidObjectId(id)) return null;

  const team = await Team.findById(toObjectId(id)).lean<ITeam>();
  if (!team) return null;

  return {
    id: team._id.toString(),
    name: team.name,
    image: team.image,
    categoryId: team.categoryId.toString(),
    status: team.status,
  };
}

/** Every team, grouped by game in the browser, for the match builder's picker. */
export type TeamOption = {
  id: string;
  name: string;
  image: string;
  categoryId: string;
  status: ContentStatus;
};

export async function listTeamOptions(): Promise<TeamOption[]> {
  await connectDB();

  const teams = await Team.find({})
    .select("name image categoryId status")
    .sort({ name: 1 })
    .lean<Pick<ITeam, "_id" | "name" | "image" | "categoryId" | "status">[]>();

  return teams.map((team) => ({
    id: team._id.toString(),
    name: team.name,
    image: team.image,
    categoryId: team.categoryId.toString(),
    status: team.status,
  }));
}

export async function createTeam(
  input: CreateTeamInput,
): Promise<MutationResult<{ id: string; name: string }>> {
  await connectDB();

  const category = await GameCategory.exists({ _id: toObjectId(input.categoryId) });
  if (!category) return { ok: false, field: "categoryId", message: "Pick a game that exists." };

  try {
    const team = await Team.create({
      name: input.name,
      categoryId: toObjectId(input.categoryId),
      image: input.image,
      status: input.status ?? "active",
    });

    return { ok: true, data: { id: team._id.toString(), name: team.name } };
  } catch (error) {
    return teamWriteFailure(error);
  }
}

export async function updateTeam(
  id: string,
  input: UpdateTeamInput,
): Promise<MutationResult<{ id: string; name: string }>> {
  await connectDB();

  if (!isValidObjectId(id)) return { ok: false, message: "That team no longer exists." };

  if (input.categoryId) {
    const category = await GameCategory.exists({ _id: toObjectId(input.categoryId) });
    if (!category) return { ok: false, field: "categoryId", message: "Pick a game that exists." };
  }

  try {
    const updated = await Team.findByIdAndUpdate(
      toObjectId(id),
      { $set: input },
      { returnDocument: "after", runValidators: true },
    ).lean<ITeam>();

    if (!updated) return { ok: false, message: "That team no longer exists." };

    return { ok: true, data: { id: updated._id.toString(), name: updated.name } };
  } catch (error) {
    return teamWriteFailure(error);
  }
}

export async function deleteTeam(id: string): Promise<MutationResult<{ name: string }>> {
  await connectDB();

  if (!isValidObjectId(id)) return { ok: false, message: "That team no longer exists." };

  const teamId = toObjectId(id);

  const team = await Team.findById(teamId).select("name").lean<Pick<ITeam, "_id" | "name">>();
  if (!team) return { ok: false, message: "That team no longer exists." };

  const matches = await Match.countDocuments({ teamIds: teamId });

  if (matches > 0) {
    return {
      ok: false,
      message: `${team.name} appears in ${matches} match${matches === 1 ? "" : "es"}. Set it to inactive instead — removing it would leave those matches short a competitor.`,
    };
  }

  await Team.deleteOne({ _id: teamId });

  return { ok: true, data: { name: team.name } };
}

/** The unique index is on `(categoryId, name)`, so a clash is always the name. */
function teamWriteFailure(error: unknown): MutationResult<never> {
  if (duplicateKeyField(error)) {
    return { ok: false, field: "name", message: "That game already has a team with this name." };
  }

  throw error;
}
