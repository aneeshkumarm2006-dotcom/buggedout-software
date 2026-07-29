import { Schema, model, models, type Model, type Types } from "mongoose";

/**
 * One-shot token backing the forgot-password flow (Phase 3.2).
 *
 * Only the SHA-256 hash of the token is stored — the raw value exists solely in
 * the reset link, so a leaked database dump can't be used to take over accounts.
 * Rows are removed by a TTL index shortly after `expiresAt`; `usedAt` marks a
 * token spent before then so the same link can't be replayed.
 */
export interface IPasswordResetToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      // TTL sweep: Mongo drops the row once `expiresAt` passes, so expired
      // tokens don't pile up. Validity is still checked in code — the sweeper
      // only runs about once a minute.
      index: { expireAfterSeconds: 0 },
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export const PasswordResetToken =
  (models.PasswordResetToken as Model<IPasswordResetToken> | undefined) ??
  model<IPasswordResetToken>("PasswordResetToken", passwordResetTokenSchema);
