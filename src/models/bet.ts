import { Schema, model, models, type Model, type Types } from "mongoose";

import { BET_STATUSES, MAX_RATIO, MIN_RATIO, type BetStatus } from "@/lib/enums";

/**
 * One selection = one independent bet. Users may back several options of the
 * same question; there are no parlays, so a Bet never spans two questions.
 *
 * `optionName` and `ratio` are SNAPSHOTS taken at placement time — settlement
 * pays `stake × ratio` from this row, never from the live Question, so later
 * odds edits can't change what an already-placed bet is worth.
 */
export interface IBet {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** Denormalised from the match so the leaderboard can filter by game without a join. */
  categoryId: Types.ObjectId;
  matchId: Types.ObjectId;
  questionId: Types.ObjectId;
  optionId: Types.ObjectId;
  optionName: string;
  ratio: number;
  stake: number;
  potentialWin: number;
  status: BetStatus;
  /** Coins actually returned on settlement: `potentialWin` if won, `stake` if refunded, else 0. */
  payout: number;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const betSchema = new Schema<IBet>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "GameCategory",
      required: true,
      index: true,
    },
    matchId: {
      type: Schema.Types.ObjectId,
      ref: "Match",
      required: true,
      index: true,
    },
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
      index: true,
    },
    optionId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    optionName: {
      type: String,
      required: true,
    },
    ratio: {
      type: Number,
      required: true,
      min: MIN_RATIO,
      max: MAX_RATIO,
    },
    stake: {
      type: Number,
      required: true,
      min: 1,
    },
    potentialWin: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: BET_STATUSES,
      default: "pending",
      index: true,
    },
    payout: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    settledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// My Bets (Open / Settled tabs) and the admin bet history.
betSchema.index({ userId: 1, status: 1, createdAt: -1 });
betSchema.index({ createdAt: -1 });
// Settlement sweeps every pending bet on a question in one pass (4.4).
betSchema.index({ questionId: 1, status: 1 });

export const Bet = (models.Bet as Model<IBet> | undefined) ?? model<IBet>("Bet", betSchema);
