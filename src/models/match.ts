import { Schema, model, models, type Model, type Types } from "mongoose";

import {
  MATCH_STATUSES,
  MAX_TEAMS_PER_MATCH,
  MIN_TEAMS_PER_MATCH,
  type MatchStatus,
} from "@/lib/enums";

export interface IMatch {
  _id: Types.ObjectId;
  title: string;
  categoryId: Types.ObjectId;
  /** Optional — a match can exist outside any tournament. */
  tournamentId: Types.ObjectId | null;
  teamIds: Types.ObjectId[];
  startTime: Date;
  status: MatchStatus;
  /** Reserved for post-MVP streaming; nothing reads it yet. */
  streamUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const matchSchema = new Schema<IMatch>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "GameCategory",
      required: true,
      index: true,
    },
    tournamentId: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      default: null,
      index: true,
    },
    teamIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Team" }],
      required: true,
      validate: [
        {
          validator: (teamIds: Types.ObjectId[]) =>
            teamIds.length >= MIN_TEAMS_PER_MATCH && teamIds.length <= MAX_TEAMS_PER_MATCH,
          message: `A match needs between ${MIN_TEAMS_PER_MATCH} and ${MAX_TEAMS_PER_MATCH} teams`,
        },
        {
          validator: (teamIds: Types.ObjectId[]) =>
            new Set(teamIds.map((id) => id.toString())).size === teamIds.length,
          message: "A team cannot be added to the same match twice",
        },
      ],
    },
    startTime: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: MATCH_STATUSES,
      default: "upcoming",
      index: true,
    },
    streamUrl: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

// Lobby/category listings: "live and upcoming for this game, soonest first".
matchSchema.index({ categoryId: 1, status: 1, startTime: 1 });
matchSchema.index({ status: 1, startTime: 1 });

export const Match =
  (models.Match as Model<IMatch> | undefined) ?? model<IMatch>("Match", matchSchema);
