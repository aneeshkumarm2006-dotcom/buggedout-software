import { Schema, model, models, type Model, type Types } from "mongoose";

import { CONTENT_STATUSES, type ContentStatus } from "@/lib/enums";

export interface ITeam {
  _id: Types.ObjectId;
  name: string;
  categoryId: Types.ObjectId;
  /** 64×64 image — resized and validated client-side before upload (Phase 6.6). */
  image: string;
  status: ContentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const teamSchema = new Schema<ITeam>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "GameCategory",
      required: true,
      index: true,
    },
    image: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: CONTENT_STATUSES,
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

// Team names are unique within a category, not globally.
teamSchema.index({ categoryId: 1, name: 1 }, { unique: true });

export const Team = (models.Team as Model<ITeam> | undefined) ?? model<ITeam>("Team", teamSchema);
