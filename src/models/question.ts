import { Schema, model, models, type Model, type Types } from "mongoose";

import {
  CONTENT_STATUSES,
  MAX_OPTIONS_PER_QUESTION,
  MAX_RATIO,
  MIN_OPTIONS_PER_QUESTION,
  MIN_RATIO,
  QUESTION_STATUSES,
  type ContentStatus,
  type QuestionStatus,
} from "@/lib/enums";

/**
 * One tappable odds button (`Turtle A | 2.0`). `_id` is what a Bet snapshots as
 * `optionId`, so options are edited in place rather than replaced wholesale.
 */
export interface IQuestionOption {
  _id: Types.ObjectId;
  name: string;
  ratio: number;
  /** `inactive` = suspended: shown greyed out, no new bets accepted. */
  status: ContentStatus;
  isWinner: boolean;
}

export interface IQuestion {
  _id: Types.ObjectId;
  matchId: Types.ObjectId;
  text: string;
  options: IQuestionOption[];
  status: QuestionStatus;
  /** Betting closes here; auto-lock runs on read and via the cron route (4.3). */
  endDate: Date;
  minStakePerBet: number;
  maxStakePerBet: number;
  resolvedAt: Date | null;
  resolvedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const questionOptionSchema = new Schema<IQuestionOption>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    ratio: {
      type: Number,
      required: true,
      min: MIN_RATIO,
      max: MAX_RATIO,
    },
    status: {
      type: String,
      enum: CONTENT_STATUSES,
      default: "active",
    },
    isWinner: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true },
);

const questionSchema = new Schema<IQuestion>(
  {
    matchId: {
      type: Schema.Types.ObjectId,
      ref: "Match",
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    options: {
      type: [questionOptionSchema],
      required: true,
      validate: {
        validator: (options: IQuestionOption[]) =>
          options.length >= MIN_OPTIONS_PER_QUESTION && options.length <= MAX_OPTIONS_PER_QUESTION,
        message: `A question needs between ${MIN_OPTIONS_PER_QUESTION} and ${MAX_OPTIONS_PER_QUESTION} options`,
      },
    },
    status: {
      type: String,
      enum: QUESTION_STATUSES,
      default: "active",
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    minStakePerBet: {
      type: Number,
      required: true,
      default: 10,
      min: 1,
    },
    maxStakePerBet: {
      type: Number,
      required: true,
      default: 10_000,
      min: 1,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

questionSchema.path("maxStakePerBet").validate(function (this: IQuestion, maxStakePerBet: number) {
  return !this.minStakePerBet || maxStakePerBet >= this.minStakePerBet;
}, "maxStakePerBet must be greater than or equal to minStakePerBet");

// Auto-lock sweep (4.3) and the Pending Results queue (6.9).
questionSchema.index({ status: 1, endDate: 1 });
questionSchema.index({ matchId: 1, createdAt: 1 });

export const Question =
  (models.Question as Model<IQuestion> | undefined) ??
  model<IQuestion>("Question", questionSchema);
