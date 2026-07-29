import "server-only";

import type { QueryFilter } from "mongoose";

import {
  ADMIN_PAGE_SIZE,
  pageSlice,
  searchRegex,
  totalPages,
  type Paged,
} from "@/lib/admin/list-params";
import { isValidObjectId, toObjectId, type MutationResult } from "@/lib/admin/shared";
import { connectDB } from "@/lib/db";
import type { TournamentStatus } from "@/lib/enums";
import { GameCategory, Match, Tournament, type IGameCategory, type ITournament } from "@/models";
import type { CreateTournamentInput, UpdateTournamentInput } from "@/schemas/tournament";

/**
 * Tournaments, admin side (Phase 6.5). A tournament groups matches of one game
 * over a date range; a match can also stand on its own, so nothing here is
 * required to create one.
 */
export type TournamentRow = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  matchCount: number;
};

export type TournamentDetail = {
  id: string;
  title: string;
  categoryId: string;
  startDate: string;
  endDate: string;
  status: TournamentStatus;
};

export type TournamentListParams = {
  page?: number;
  q?: string;
  status?: TournamentStatus;
  categoryId?: string;
};

export async function listTournaments(
  params: TournamentListParams = {},
): Promise<Paged<TournamentRow>> {
  await connectDB();

  const { skip, limit } = pageSlice(params.page ?? 1);
  const filter: QueryFilter<ITournament> = {};

  if (params.status) filter.status = params.status;
  if (params.categoryId && isValidObjectId(params.categoryId)) {
    filter.categoryId = toObjectId(params.categoryId);
  }
  if (params.q) filter.title = searchRegex(params.q);

  const [total, tournaments] = await Promise.all([
    Tournament.countDocuments(filter),
    Tournament.find(filter)
      .sort({ startDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean<ITournament[]>(),
  ]);

  const [categories, matchCounts] = await Promise.all([
    GameCategory.find({ _id: { $in: tournaments.map((tournament) => tournament.categoryId) } })
      .select("title")
      .lean<Pick<IGameCategory, "_id" | "title">[]>(),
    Match.aggregate<{ _id: unknown; count: number }>([
      { $match: { tournamentId: { $in: tournaments.map((tournament) => tournament._id) } } },
      { $group: { _id: "$tournamentId", count: { $sum: 1 } } },
    ]),
  ]);

  const categoryTitleById = new Map(categories.map((c) => [c._id.toString(), c.title]));
  const matchCountById = new Map(matchCounts.map((row) => [String(row._id), row.count]));

  return {
    rows: tournaments.map((tournament) => ({
      id: tournament._id.toString(),
      title: tournament.title,
      categoryId: tournament.categoryId.toString(),
      categoryTitle: categoryTitleById.get(tournament.categoryId.toString()) ?? "Game removed",
      startDate: tournament.startDate.toISOString(),
      endDate: tournament.endDate.toISOString(),
      status: tournament.status,
      matchCount: matchCountById.get(tournament._id.toString()) ?? 0,
    })),
    page: params.page ?? 1,
    total,
    totalPages: totalPages(total, ADMIN_PAGE_SIZE),
  };
}

export async function getTournament(id: string): Promise<TournamentDetail | null> {
  await connectDB();

  if (!isValidObjectId(id)) return null;

  const tournament = await Tournament.findById(toObjectId(id)).lean<ITournament>();
  if (!tournament) return null;

  return {
    id: tournament._id.toString(),
    title: tournament.title,
    categoryId: tournament.categoryId.toString(),
    startDate: tournament.startDate.toISOString(),
    endDate: tournament.endDate.toISOString(),
    status: tournament.status,
  };
}

/** Tournaments grouped by game, for the dependent picker on the match form. */
export type TournamentOption = {
  id: string;
  title: string;
  categoryId: string;
  status: TournamentStatus;
};

export async function listTournamentOptions(): Promise<TournamentOption[]> {
  await connectDB();

  const tournaments = await Tournament.find({})
    .select("title categoryId status")
    .sort({ startDate: -1 })
    .lean<Pick<ITournament, "_id" | "title" | "categoryId" | "status">[]>();

  return tournaments.map((tournament) => ({
    id: tournament._id.toString(),
    title: tournament.title,
    categoryId: tournament.categoryId.toString(),
    status: tournament.status,
  }));
}

export async function createTournament(
  input: CreateTournamentInput,
): Promise<MutationResult<{ id: string; title: string }>> {
  await connectDB();

  const category = await GameCategory.exists({ _id: toObjectId(input.categoryId) });
  if (!category) return { ok: false, field: "categoryId", message: "Pick a game that exists." };

  const tournament = await Tournament.create({
    title: input.title,
    categoryId: toObjectId(input.categoryId),
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.status ?? "upcoming",
  });

  return { ok: true, data: { id: tournament._id.toString(), title: tournament.title } };
}

export async function updateTournament(
  id: string,
  input: UpdateTournamentInput,
): Promise<MutationResult<{ id: string; title: string }>> {
  await connectDB();

  if (!isValidObjectId(id)) return { ok: false, message: "That tournament no longer exists." };

  const existing = await Tournament.findById(toObjectId(id)).lean<ITournament>();
  if (!existing) return { ok: false, message: "That tournament no longer exists." };

  // The model's own `endDate` validator can't see a field the update didn't
  // carry, so the pair is re-checked against what is already stored.
  const startDate = input.startDate ?? existing.startDate;
  const endDate = input.endDate ?? existing.endDate;

  if (endDate < startDate) {
    return { ok: false, field: "endDate", message: "End date must be on or after the start date." };
  }

  if (input.categoryId) {
    const category = await GameCategory.exists({ _id: toObjectId(input.categoryId) });
    if (!category) return { ok: false, field: "categoryId", message: "Pick a game that exists." };
  }

  const updated = await Tournament.findByIdAndUpdate(
    toObjectId(id),
    { $set: input },
    { returnDocument: "after", runValidators: true },
  ).lean<ITournament>();

  if (!updated) return { ok: false, message: "That tournament no longer exists." };

  return { ok: true, data: { id: updated._id.toString(), title: updated.title } };
}

export async function deleteTournament(id: string): Promise<MutationResult<{ title: string }>> {
  await connectDB();

  if (!isValidObjectId(id)) return { ok: false, message: "That tournament no longer exists." };

  const tournamentId = toObjectId(id);

  const tournament = await Tournament.findById(tournamentId).select("title").lean<
    Pick<ITournament, "_id" | "title">
  >();

  if (!tournament) return { ok: false, message: "That tournament no longer exists." };

  const matches = await Match.countDocuments({ tournamentId });

  if (matches > 0) {
    return {
      ok: false,
      message: `${tournament.title} still has ${matches} match${matches === 1 ? "" : "es"}. Move or remove those first.`,
    };
  }

  await Tournament.deleteOne({ _id: tournamentId });

  return { ok: true, data: { title: tournament.title } };
}
