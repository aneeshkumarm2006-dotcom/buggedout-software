import "server-only";

import { Types } from "mongoose";

import { isValidObjectId, toObjectId, type MutationResult } from "@/lib/admin/shared";
import { connectDB } from "@/lib/db";
import {
  EDITABLE_QUESTION_STATUSES,
  type ContentStatus,
  type QuestionStatus,
} from "@/lib/enums";
import {
  Bet,
  GameCategory,
  Match,
  Question,
  type IGameCategory,
  type IMatch,
  type IQuestion,
  type IQuestionOption,
} from "@/models";
import type { CreateQuestionInput, UpdateQuestionInput } from "@/schemas/question";

/**
 * Questions — the markets users actually bet on (Phase 6.8).
 *
 * An option's `_id` is what a Bet snapshots as `optionId`, so the editor works
 * *in place*: a row that came back with its id keeps it, and only genuinely new
 * rows get a new one. Replacing the array wholesale would orphan every bet on
 * the market, which is why `updateQuestion` is as careful as it is.
 *
 * Odds can still be edited while bets are outstanding — settlement pays the
 * `potentialWin` snapshot taken at placement (4.4), so a change only ever
 * affects bets placed after it.
 */
export type QuestionOptionRow = {
  id: string;
  name: string;
  ratio: number;
  status: ContentStatus;
  isWinner: boolean;
  /** Bets riding on this option — what makes removing it dangerous. */
  bets: number;
  stake: number;
};

export type QuestionRow = {
  id: string;
  matchId: string;
  text: string;
  status: QuestionStatus;
  endDate: string;
  minStakePerBet: number;
  maxStakePerBet: number;
  options: QuestionOptionRow[];
  pendingBets: number;
  totalStake: number;
  resolvedAt: string | null;
};

export type QuestionDetail = {
  id: string;
  matchId: string;
  text: string;
  status: QuestionStatus;
  endDate: string;
  minStakePerBet: number;
  maxStakePerBet: number;
  options: { id: string; name: string; ratio: number; status: ContentStatus; bets: number }[];
  /** Resolved or void: the editor renders read-only. */
  locked: boolean;
};

export async function listMatchQuestions(matchId: string): Promise<QuestionRow[]> {
  await connectDB();

  if (!isValidObjectId(matchId)) return [];

  const id = toObjectId(matchId);

  const [questions, betStats] = await Promise.all([
    Question.find({ matchId: id }).sort({ createdAt: 1 }).lean<IQuestion[]>(),
    Bet.aggregate<{
      _id: { questionId: Types.ObjectId; optionId: Types.ObjectId };
      bets: number;
      stake: number;
      pending: number;
    }>([
      { $match: { matchId: id } },
      {
        $group: {
          _id: { questionId: "$questionId", optionId: "$optionId" },
          bets: { $sum: 1 },
          stake: { $sum: "$stake" },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const byOption = new Map(
    betStats.map((row) => [`${row._id.questionId.toString()}:${row._id.optionId.toString()}`, row]),
  );

  return questions.map((question) => {
    const options = question.options.map((option) => {
      const stats = byOption.get(`${question._id.toString()}:${option._id.toString()}`);

      return {
        id: option._id.toString(),
        name: option.name,
        ratio: option.ratio,
        status: option.status,
        isWinner: option.isWinner,
        bets: stats?.bets ?? 0,
        stake: stats?.stake ?? 0,
      };
    });

    return {
      id: question._id.toString(),
      matchId: question.matchId.toString(),
      text: question.text,
      status: question.status,
      endDate: question.endDate.toISOString(),
      minStakePerBet: question.minStakePerBet,
      maxStakePerBet: question.maxStakePerBet,
      options,
      pendingBets: question.options.reduce(
        (sum, option) =>
          sum +
          (byOption.get(`${question._id.toString()}:${option._id.toString()}`)?.pending ?? 0),
        0,
      ),
      totalStake: options.reduce((sum, option) => sum + option.stake, 0),
      resolvedAt: question.resolvedAt?.toISOString() ?? null,
    };
  });
}

export async function getQuestion(id: string): Promise<QuestionDetail | null> {
  await connectDB();

  if (!isValidObjectId(id)) return null;

  const question = await Question.findById(toObjectId(id)).lean<IQuestion>();
  if (!question) return null;

  const betCounts = await Bet.aggregate<{ _id: Types.ObjectId; bets: number }>([
    { $match: { questionId: question._id } },
    { $group: { _id: "$optionId", bets: { $sum: 1 } } },
  ]);

  const betsByOption = new Map(betCounts.map((row) => [row._id.toString(), row.bets]));

  return {
    id: question._id.toString(),
    matchId: question.matchId.toString(),
    text: question.text,
    status: question.status,
    endDate: question.endDate.toISOString(),
    minStakePerBet: question.minStakePerBet,
    maxStakePerBet: question.maxStakePerBet,
    options: question.options.map((option) => ({
      id: option._id.toString(),
      name: option.name,
      ratio: option.ratio,
      status: option.status,
      bets: betsByOption.get(option._id.toString()) ?? 0,
    })),
    locked: question.status === "resolved" || question.status === "void",
  };
}

/** The presets behind "insert from template" — the match's own game's (6.4). */
export type MarketTemplateOption = {
  question: string;
  options: string[];
  defaultRatio: number;
};

export async function getMatchTemplates(matchId: string): Promise<MarketTemplateOption[]> {
  await connectDB();

  if (!isValidObjectId(matchId)) return [];

  const match = await Match.findById(toObjectId(matchId))
    .select("categoryId")
    .lean<Pick<IMatch, "_id" | "categoryId">>();

  if (!match) return [];

  const category = await GameCategory.findById(match.categoryId)
    .select("marketTemplates")
    .lean<Pick<IGameCategory, "_id" | "marketTemplates">>();

  return (category?.marketTemplates ?? []).map((template) => ({
    question: template.question,
    options: [...template.options],
    defaultRatio: template.defaultRatio,
  }));
}

export async function createQuestion(
  input: CreateQuestionInput,
): Promise<MutationResult<{ id: string; matchId: string; text: string }>> {
  await connectDB();

  const match = await Match.findById(toObjectId(input.matchId))
    .select("status")
    .lean<Pick<IMatch, "_id" | "status">>();

  if (!match) return { ok: false, message: "That match no longer exists." };

  if (match.status === "cancelled") {
    return { ok: false, message: "This match was cancelled — it can't take new markets." };
  }

  const status = input.status ?? "active";
  if (!EDITABLE_QUESTION_STATUSES.includes(status)) {
    return {
      ok: false,
      field: "status",
      message: "A new market starts open or closed; resolving and voiding happen from Results.",
    };
  }

  const question = await Question.create({
    matchId: match._id,
    text: input.text,
    options: input.options.map((option) => ({
      _id: new Types.ObjectId(),
      name: option.name,
      ratio: option.ratio,
      status: option.status,
      isWinner: false,
    })),
    status,
    endDate: input.endDate,
    minStakePerBet: input.minStakePerBet ?? 10,
    maxStakePerBet: input.maxStakePerBet ?? 10_000,
  });

  return {
    ok: true,
    data: {
      id: question._id.toString(),
      matchId: match._id.toString(),
      text: question.text,
    },
  };
}

export async function updateQuestion(
  id: string,
  input: UpdateQuestionInput,
): Promise<MutationResult<{ id: string; matchId: string; text: string }>> {
  await connectDB();

  if (!isValidObjectId(id)) return { ok: false, message: "That market no longer exists." };

  const question = await Question.findById(toObjectId(id)).lean<IQuestion>();
  if (!question) return { ok: false, message: "That market no longer exists." };

  if (question.status === "resolved" || question.status === "void") {
    return {
      ok: false,
      message:
        question.status === "resolved"
          ? "This market is already resolved and paid out — it can't be edited."
          : "This market was voided and refunded — it can't be edited.",
    };
  }

  if (input.status && !EDITABLE_QUESTION_STATUSES.includes(input.status)) {
    return {
      ok: false,
      field: "status",
      message: "Resolving and voiding happen from Results, so the payouts actually run.",
    };
  }

  const changes: Record<string, unknown> = {
    ...input,
    // Rebuilt below when options are part of the submit.
    options: undefined,
  };

  if (input.options) {
    const rebuilt = await rebuildOptions(question, input.options);
    if (!rebuilt.ok) return rebuilt;
    changes.options = rebuilt.data;
  } else {
    delete changes.options;
  }

  const minStake = input.minStakePerBet ?? question.minStakePerBet;
  const maxStake = input.maxStakePerBet ?? question.maxStakePerBet;

  if (maxStake < minStake) {
    return {
      ok: false,
      field: "maxStakePerBet",
      message: "Max stake must be greater than or equal to min stake.",
    };
  }

  // Guarded on the status we read: if settlement resolved this market a moment
  // ago, the update matches nothing rather than editing a settled result.
  const updated = await Question.findOneAndUpdate(
    { _id: question._id, status: { $in: EDITABLE_QUESTION_STATUSES } },
    { $set: changes },
    { returnDocument: "after", runValidators: true },
  ).lean<IQuestion>();

  if (!updated) {
    return { ok: false, message: "This market was settled a moment ago and can no longer be edited." };
  }

  return {
    ok: true,
    data: {
      id: updated._id.toString(),
      matchId: updated.matchId.toString(),
      text: updated.text,
    },
  };
}

/**
 * Merges the submitted rows onto the stored options.
 *
 * Kept ids keep their `isWinner` flag and, more importantly, their identity —
 * the bets already placed point at these `_id`s. Dropping an option that has
 * bets is refused outright: those bets would have nothing left to settle
 * against.
 */
async function rebuildOptions(
  question: IQuestion,
  submitted: NonNullable<UpdateQuestionInput["options"]>,
): Promise<MutationResult<IQuestionOption[]>> {
  const existingById = new Map(question.options.map((option) => [option._id.toString(), option]));
  const keptIds = new Set<string>();
  const options: IQuestionOption[] = [];

  for (const row of submitted) {
    if (row._id) {
      const current = existingById.get(row._id);

      if (!current) {
        return { ok: false, field: "options", message: "One of those options is not on this market." };
      }

      keptIds.add(row._id);

      options.push({
        _id: current._id,
        name: row.name,
        ratio: row.ratio,
        status: row.status,
        isWinner: current.isWinner,
      });
    } else {
      options.push({
        _id: new Types.ObjectId(),
        name: row.name,
        ratio: row.ratio,
        status: row.status,
        isWinner: false,
      });
    }
  }

  const removed = question.options
    .filter((option) => !keptIds.has(option._id.toString()))
    .map((option) => option._id);

  if (removed.length > 0) {
    const bets = await Bet.countDocuments({
      questionId: question._id,
      optionId: { $in: removed },
    });

    if (bets > 0) {
      return {
        ok: false,
        field: "options",
        message: `${bets} bet${bets === 1 ? " is" : "s are"} riding on an option you removed. Suspend it instead of deleting it.`,
      };
    }
  }

  return { ok: true, data: options };
}

export async function deleteQuestion(id: string): Promise<MutationResult<{ text: string; matchId: string }>> {
  await connectDB();

  if (!isValidObjectId(id)) return { ok: false, message: "That market no longer exists." };

  const questionId = toObjectId(id);

  const question = await Question.findById(questionId)
    .select("text matchId")
    .lean<Pick<IQuestion, "_id" | "text" | "matchId">>();

  if (!question) return { ok: false, message: "That market no longer exists." };

  const bets = await Bet.countDocuments({ questionId });

  if (bets > 0) {
    return {
      ok: false,
      message: `This market has ${bets} bet${bets === 1 ? "" : "s"} on it. Void it instead — that refunds every stake and leaves the history intact.`,
    };
  }

  await Question.deleteOne({ _id: questionId });

  return { ok: true, data: { text: question.text, matchId: question.matchId.toString() } };
}
