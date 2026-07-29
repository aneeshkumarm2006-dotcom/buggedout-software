import "server-only";

import type { PipelineStage, QueryFilter, Types } from "mongoose";

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
import { GameCategory, Match, Team, Tournament, type IGameCategory } from "@/models";
import type { CreateGameCategoryInput, UpdateGameCategoryInput } from "@/schemas/game-category";

/**
 * Game categories, admin side (Phase 6.4).
 *
 * A category is one of the ten games. Its `marketTemplates` are the preset
 * questions an admin drops onto a match in 6.8 — copied by value at that point,
 * so editing a template here never rewrites a market that is already live.
 */
export type CategoryRow = {
  id: string;
  title: string;
  slug: string;
  cardImage: string;
  animatedCard: string | null;
  status: ContentStatus;
  sortOrder: number;
  templateCount: number;
  teamCount: number;
  matchCount: number;
  createdAt: string;
};

export type CategoryTemplate = {
  question: string;
  options: string[];
  defaultRatio: number;
};

export type CategoryDetail = {
  id: string;
  title: string;
  slug: string;
  cardImage: string;
  animatedCard: string | null;
  status: ContentStatus;
  sortOrder: number;
  marketTemplates: CategoryTemplate[];
};

export type CategoryListParams = {
  page?: number;
  q?: string;
  status?: ContentStatus;
};

export async function listCategories(
  params: CategoryListParams = {},
): Promise<Paged<CategoryRow>> {
  await connectDB();

  const { skip, limit } = pageSlice(params.page ?? 1);
  const filter: QueryFilter<IGameCategory> = {};

  if (params.status) filter.status = params.status;
  if (params.q) {
    const term = searchRegex(params.q);
    filter.$or = [{ title: term }, { slug: term }];
  }

  const [total, categories] = await Promise.all([
    GameCategory.countDocuments(filter),
    GameCategory.find(filter)
      .sort({ sortOrder: 1, title: 1 })
      .skip(skip)
      .limit(limit)
      .lean<IGameCategory[]>(),
  ]);

  const ids = categories.map((category) => category._id);

  // Two grouped counts for the page rather than two queries per row.
  const [teamCounts, matchCounts] = await Promise.all([
    Team.aggregate<CategoryCount>(countByCategoryPipeline(ids)),
    Match.aggregate<CategoryCount>(countByCategoryPipeline(ids)),
  ]);

  const teamCountById = new Map(teamCounts.map((row) => [row._id.toString(), row.count]));
  const matchCountById = new Map(matchCounts.map((row) => [row._id.toString(), row.count]));

  return {
    rows: categories.map((category) => ({
      id: category._id.toString(),
      title: category.title,
      slug: category.slug,
      cardImage: category.cardImage,
      animatedCard: category.animatedCard,
      status: category.status,
      sortOrder: category.sortOrder,
      templateCount: category.marketTemplates.length,
      teamCount: teamCountById.get(category._id.toString()) ?? 0,
      matchCount: matchCountById.get(category._id.toString()) ?? 0,
      createdAt: category.createdAt.toISOString(),
    })),
    page: params.page ?? 1,
    total,
    totalPages: totalPages(total, ADMIN_PAGE_SIZE),
  };
}

type CategoryCount = { _id: Types.ObjectId; count: number };

/** "How many of these belong to each category" — Teams and Matches both use it. */
function countByCategoryPipeline(ids: Types.ObjectId[]): PipelineStage[] {
  return [
    { $match: { categoryId: { $in: ids } } },
    { $group: { _id: "$categoryId", count: { $sum: 1 } } },
  ];
}

export async function getCategory(id: string): Promise<CategoryDetail | null> {
  await connectDB();

  if (!isValidObjectId(id)) return null;

  const category = await GameCategory.findById(toObjectId(id)).lean<IGameCategory>();
  if (!category) return null;

  return {
    id: category._id.toString(),
    title: category.title,
    slug: category.slug,
    cardImage: category.cardImage,
    animatedCard: category.animatedCard,
    status: category.status,
    sortOrder: category.sortOrder,
    marketTemplates: category.marketTemplates.map((template) => ({
      question: template.question,
      options: [...template.options],
      defaultRatio: template.defaultRatio,
    })),
  };
}

/** Every category, for the pickers on the tournament, team and match forms. */
export type CategoryOption = { id: string; title: string; status: ContentStatus };

export async function listCategoryOptions(): Promise<CategoryOption[]> {
  await connectDB();

  const categories = await GameCategory.find({})
    .select("title status")
    .sort({ sortOrder: 1, title: 1 })
    .lean<Pick<IGameCategory, "_id" | "title" | "status">[]>();

  return categories.map((category) => ({
    id: category._id.toString(),
    title: category.title,
    status: category.status,
  }));
}

export async function createCategory(
  input: CreateGameCategoryInput,
): Promise<MutationResult<{ id: string; title: string }>> {
  await connectDB();

  try {
    const category = await GameCategory.create({
      title: input.title,
      slug: input.slug,
      cardImage: input.cardImage,
      animatedCard: input.animatedCard ?? null,
      status: input.status ?? "active",
      sortOrder: input.sortOrder ?? 0,
      marketTemplates: input.marketTemplates ?? [],
    });

    return { ok: true, data: { id: category._id.toString(), title: category.title } };
  } catch (error) {
    return categoryWriteFailure(error);
  }
}

export async function updateCategory(
  id: string,
  input: UpdateGameCategoryInput,
): Promise<MutationResult<{ id: string; title: string }>> {
  await connectDB();

  if (!isValidObjectId(id)) return { ok: false, message: "That game no longer exists." };

  try {
    const updated = await GameCategory.findByIdAndUpdate(
      toObjectId(id),
      { $set: input },
      // Mongoose skips schema validators on an update unless asked.
      { returnDocument: "after", runValidators: true },
    ).lean<IGameCategory>();

    if (!updated) return { ok: false, message: "That game no longer exists." };

    return { ok: true, data: { id: updated._id.toString(), title: updated.title } };
  } catch (error) {
    return categoryWriteFailure(error);
  }
}

/**
 * Removal is refused while anything points at the category. Deleting it anyway
 * would leave teams, matches and — through them — settled bets referring to a
 * game that no longer exists; switching it to `inactive` takes it off the lobby
 * without breaking history.
 */
export async function deleteCategory(id: string): Promise<MutationResult<{ title: string }>> {
  await connectDB();

  if (!isValidObjectId(id)) return { ok: false, message: "That game no longer exists." };

  const categoryId = toObjectId(id);

  const category = await GameCategory.findById(categoryId).select("title").lean<
    Pick<IGameCategory, "_id" | "title">
  >();

  if (!category) return { ok: false, message: "That game no longer exists." };

  const [matches, tournaments, teams] = await Promise.all([
    Match.countDocuments({ categoryId }),
    Tournament.countDocuments({ categoryId }),
    Team.countDocuments({ categoryId }),
  ]);

  const blockers = [
    matches > 0 ? `${matches} match${matches === 1 ? "" : "es"}` : null,
    tournaments > 0 ? `${tournaments} tournament${tournaments === 1 ? "" : "s"}` : null,
    teams > 0 ? `${teams} team${teams === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  if (blockers.length > 0) {
    return {
      ok: false,
      message: `${category.title} still has ${blockers.join(", ")}. Set it to inactive instead, or clear those first.`,
    };
  }

  await GameCategory.deleteOne({ _id: categoryId });

  return { ok: true, data: { title: category.title } };
}

function categoryWriteFailure(error: unknown): MutationResult<never> {
  if (duplicateKeyField(error) === "slug") {
    return { ok: false, field: "slug", message: "That slug is already used by another game." };
  }

  throw error;
}
