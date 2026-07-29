import { Schema, model, models, type Model, type Types } from "mongoose";

import { TOURNAMENT_STATUSES, type TournamentStatus } from "@/lib/enums";

export interface ITournament {
  _id: Types.ObjectId;
  title: string;
  categoryId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  status: TournamentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const tournamentSchema = new Schema<ITournament>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "GameCategory",
      required: true,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: TOURNAMENT_STATUSES,
      default: "upcoming",
      index: true,
    },
  },
  { timestamps: true },
);

// Document-level backstop only: it does not fire on a `findOneAndUpdate` that
// carries just one of the two dates, so `updateTournamentSchema` re-checks the
// pair before anything reaches Mongoose.
tournamentSchema.path("endDate").validate(function (this: ITournament, endDate: Date) {
  return !this.startDate || endDate >= this.startDate;
}, "endDate must be on or after startDate");

tournamentSchema.index({ categoryId: 1, startDate: -1 });

export const Tournament =
  (models.Tournament as Model<ITournament> | undefined) ??
  model<ITournament>("Tournament", tournamentSchema);
