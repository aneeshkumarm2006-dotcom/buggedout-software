import { Schema, model, models, type Model, type Types } from "mongoose";

import {
  CONTENT_STATUSES,
  MAX_OPTIONS_PER_QUESTION,
  MAX_RATIO,
  MIN_OPTIONS_PER_QUESTION,
  MIN_RATIO,
  type ContentStatus,
} from "@/lib/enums";

/**
 * A preset question the admin can drop onto a match of this category ("insert
 * from template", Phase 6.8). Copied by value — editing a template later never
 * touches questions already created from it.
 */
export interface IMarketTemplate {
  _id: Types.ObjectId;
  question: string;
  options: string[];
  defaultRatio: number;
}

export interface IGameCategory {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  cardImage: string;
  /** Optional `.mp4` played on desktop hover (Phase 8.3). */
  animatedCard: string | null;
  status: ContentStatus;
  sortOrder: number;
  marketTemplates: IMarketTemplate[];
  createdAt: Date;
  updatedAt: Date;
}

const marketTemplateSchema = new Schema<IMarketTemplate>(
  {
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (options: string[]) =>
          options.length >= MIN_OPTIONS_PER_QUESTION && options.length <= MAX_OPTIONS_PER_QUESTION,
        message: `A template needs between ${MIN_OPTIONS_PER_QUESTION} and ${MAX_OPTIONS_PER_QUESTION} options`,
      },
    },
    defaultRatio: {
      type: Number,
      required: true,
      min: MIN_RATIO,
      max: MAX_RATIO,
    },
  },
  { _id: true },
);

const gameCategorySchema = new Schema<IGameCategory>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    cardImage: {
      type: String,
      required: true,
    },
    animatedCard: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: CONTENT_STATUSES,
      default: "active",
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    marketTemplates: {
      type: [marketTemplateSchema],
      default: [],
    },
  },
  { timestamps: true },
);

// Lobby ordering: the 10 game cards render in `sortOrder` then alphabetical.
gameCategorySchema.index({ sortOrder: 1, title: 1 });

export const GameCategory =
  (models.GameCategory as Model<IGameCategory> | undefined) ??
  model<IGameCategory>("GameCategory", gameCategorySchema);
