import "server-only";

import { Types, type QueryFilter } from "mongoose";

import { loadMatchQuestions } from "@/lib/betting";
import { connectDB } from "@/lib/db";
import type { ContentStatus, MatchStatus, QuestionStatus } from "@/lib/enums";
import {
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

/**
 * Read models for the category listing (5.3) and the match page (5.4).
 *
 * Everything crosses into the browser as a plain object with string ids and ISO
 * timestamps: an `ObjectId` is not serialisable across the server/client
 * boundary, and the odds buttons are client components.
 */

export type CategoryRef = {
  id: string;
  title: string;
  slug: string;
  cardImage: string;
};

export type TeamRef = {
  id: string;
  name: string;
  image: string;
};

export type MatchListItem = {
  id: string;
  title: string;
  status: MatchStatus;
  /** ISO 8601. */
  startTime: string;
  teams: TeamRef[];
  /** Markets still taking bets — what the card promises when you tap through. */
  openMarkets: number;
  totalMarkets: number;
};

export type MatchFilter = "all" | "live" | "upcoming" | "finished";

export const MATCH_FILTERS: readonly MatchFilter[] = ["all", "live", "upcoming", "finished"];

export function parseMatchFilter(value: string | undefined): MatchFilter {
  return MATCH_FILTERS.includes(value as MatchFilter) ? (value as MatchFilter) : "all";
}

const FILTER_STATUSES: Record<MatchFilter, MatchStatus[] | null> = {
  all: null,
  live: ["live"],
  upcoming: ["upcoming"],
  finished: ["locked", "resolved", "cancelled"],
};

export async function getCategoryBySlug(slug: string): Promise<CategoryRef | null> {
  await connectDB();

  const category = await GameCategory.findOne({ slug, status: "active" })
    .select("title slug cardImage")
    .lean<Pick<IGameCategory, "_id" | "title" | "slug" | "cardImage">>();

  if (!category) return null;

  return {
    id: category._id.toString(),
    title: category.title,
    slug: category.slug,
    cardImage: category.cardImage,
  };
}

export type CategoryMatches = {
  matches: MatchListItem[];
  counts: Record<MatchFilter, number>;
};

/**
 * A category's matches (5.3), newest business first: live, then what is about
 * to start, then everything already done. Within each group the soonest start
 * comes first, so the list reads the way a schedule does.
 */
export async function getCategoryMatches(
  categoryId: string,
  filter: MatchFilter,
  limit = 40,
): Promise<CategoryMatches> {
  await connectDB();

  const id = new Types.ObjectId(categoryId);

  const byStatus = await Match.aggregate<{ _id: MatchStatus; count: number }>([
    { $match: { categoryId: id } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const tally = new Map(byStatus.map((row) => [row._id, row.count]));
  const sumOf = (statuses: MatchStatus[]) =>
    statuses.reduce((sum, status) => sum + (tally.get(status) ?? 0), 0);

  const counts: Record<MatchFilter, number> = {
    all: [...tally.values()].reduce((sum, count) => sum + count, 0),
    live: sumOf(FILTER_STATUSES.live!),
    upcoming: sumOf(FILTER_STATUSES.upcoming!),
    finished: sumOf(FILTER_STATUSES.finished!),
  };

  const query: QueryFilter<IMatch> = { categoryId: id };
  const statuses = FILTER_STATUSES[filter];
  if (statuses) query.status = { $in: statuses };

  const matches = await Match.find(query)
    .select("title status startTime teamIds")
    .sort({ startTime: 1 })
    .limit(limit)
    .lean<Pick<IMatch, "_id" | "title" | "status" | "startTime" | "teamIds">[]>();

  const list = await decorateMatches(matches);

  // Sorted in memory rather than in Mongo: the order is by *status group* first
  // and there is no index that expresses "live, then upcoming, then done".
  list.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  return { matches: list, counts };
}

const STATUS_RANK: Record<MatchStatus, number> = {
  live: 0,
  upcoming: 1,
  locked: 2,
  resolved: 3,
  cancelled: 4,
};

/** Teams and market counts for a page of matches — two queries, not two per row. */
async function decorateMatches(
  matches: Pick<IMatch, "_id" | "title" | "status" | "startTime" | "teamIds">[],
): Promise<MatchListItem[]> {
  if (matches.length === 0) return [];

  const teamIds = [...new Set(matches.flatMap((match) => match.teamIds.map(String)))];

  const [teams, markets] = await Promise.all([
    Team.find({ _id: { $in: teamIds.map((value) => new Types.ObjectId(value)) } })
      .select("name image")
      .lean<Pick<ITeam, "_id" | "name" | "image">[]>(),
    Question.aggregate<{ _id: Types.ObjectId; total: number; open: number }>([
      { $match: { matchId: { $in: matches.map((match) => match._id) } } },
      {
        $group: {
          _id: "$matchId",
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const teamById = new Map(teams.map((team) => [team._id.toString(), team]));
  const marketsByMatch = new Map(markets.map((row) => [row._id.toString(), row]));

  return matches.map((match) => {
    const counts = marketsByMatch.get(match._id.toString());

    return {
      id: match._id.toString(),
      title: match.title,
      status: match.status,
      startTime: match.startTime.toISOString(),
      teams: match.teamIds
        .map((teamId) => teamById.get(teamId.toString()))
        .filter((team) => team !== undefined)
        .map((team) => ({
          id: team._id.toString(),
          name: team.name,
          image: team.image,
        })),
      openMarkets: counts?.open ?? 0,
      totalMarkets: counts?.total ?? 0,
    };
  });
}

/* ------------------------------------------------------------------ *
 * 5.4 — the match page
 * ------------------------------------------------------------------ */

export type MarketOption = {
  id: string;
  name: string;
  ratio: number;
  status: ContentStatus;
  isWinner: boolean;
};

export type Market = {
  id: string;
  text: string;
  status: QuestionStatus;
  /** ISO 8601 — betting closes here, and the countdown on the card runs to it. */
  endDate: string;
  minStake: number;
  maxStake: number;
  options: MarketOption[];
};

export type MatchDetail = {
  id: string;
  title: string;
  status: MatchStatus;
  startTime: string;
  category: CategoryRef;
  tournament: { id: string; title: string } | null;
  teams: TeamRef[];
  markets: Market[];
  /** `true` while the match itself will still accept a bet (Phase 4.1's rule). */
  bettable: boolean;
};

/**
 * Everything the match page renders (5.4).
 *
 * Questions come through `loadMatchQuestions`, which locks any that have run
 * past their end time before handing them over — the "check on read" half of
 * 4.3. Without it a market whose deadline passed while the page was cached
 * would still render tappable odds.
 */
export async function getMatchDetail(matchId: string): Promise<MatchDetail | null> {
  await connectDB();

  if (!Types.ObjectId.isValid(matchId)) return null;

  const match = await Match.findById(matchId)
    .select("title status startTime teamIds categoryId tournamentId")
    .lean<
      Pick<
        IMatch,
        "_id" | "title" | "status" | "startTime" | "teamIds" | "categoryId" | "tournamentId"
      >
    >();

  if (!match) return null;

  const [category, teams, tournament, questions] = await Promise.all([
    GameCategory.findById(match.categoryId)
      .select("title slug cardImage")
      .lean<Pick<IGameCategory, "_id" | "title" | "slug" | "cardImage">>(),
    Team.find({ _id: { $in: match.teamIds } })
      .select("name image")
      .lean<Pick<ITeam, "_id" | "name" | "image">[]>(),
    match.tournamentId
      ? Tournament.findById(match.tournamentId)
          .select("title")
          .lean<Pick<ITournament, "_id" | "title">>()
      : null,
    loadMatchQuestions(match._id),
  ]);

  if (!category) return null;

  const teamById = new Map(teams.map((team) => [team._id.toString(), team]));

  return {
    id: match._id.toString(),
    title: match.title,
    status: match.status,
    startTime: match.startTime.toISOString(),
    category: {
      id: category._id.toString(),
      title: category.title,
      slug: category.slug,
      cardImage: category.cardImage,
    },
    tournament: tournament ? { id: tournament._id.toString(), title: tournament.title } : null,
    // Ordered by `teamIds` so the admin's line-up order survives the lookup.
    teams: match.teamIds
      .map((teamId) => teamById.get(teamId.toString()))
      .filter((team) => team !== undefined)
      .map((team) => ({ id: team._id.toString(), name: team.name, image: team.image })),
    markets: questions.map((question) => ({
      id: question._id.toString(),
      text: question.text,
      status: question.status,
      endDate: question.endDate.toISOString(),
      minStake: question.minStakePerBet,
      maxStake: question.maxStakePerBet,
      options: question.options.map((option) => ({
        id: option._id.toString(),
        name: option.name,
        ratio: option.ratio,
        status: option.status,
        isWinner: option.isWinner,
      })),
    })),
    bettable: match.status === "upcoming" || match.status === "live",
  };
}
