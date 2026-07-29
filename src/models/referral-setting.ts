import { Schema, model, models, type Model, type Types } from "mongoose";

import { REFERRAL_COMMISSION_BASES, type ReferralCommissionBasis } from "@/lib/enums";

/** The one and only key a ReferralSetting document may carry. */
export const REFERRAL_SETTING_KEY = "referral";

/**
 * Singleton. The unique index on `key` (always `"referral"`) is what enforces
 * "exactly one row" at the database level, so a race between two admins saving
 * settings can't fork the config.
 */
export interface IReferralSetting {
  _id: Types.ObjectId;
  key: typeof REFERRAL_SETTING_KEY;
  enabled: boolean;
  /** Paid to the referrer when someone signs up with their code (Phase 4.7). */
  signupBonusReferrer: number;
  /** Paid to the new user on top of the standard signup bonus. */
  signupBonusReferred: number;
  /** Percent of `commissionBasis` credited to the referrer on each settlement. */
  commissionPercent: number;
  commissionBasis: ReferralCommissionBasis;
  createdAt: Date;
  updatedAt: Date;
}

const referralSettingSchema = new Schema<IReferralSetting>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      default: REFERRAL_SETTING_KEY,
      enum: [REFERRAL_SETTING_KEY],
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    signupBonusReferrer: {
      type: Number,
      default: 100,
      min: 0,
    },
    signupBonusReferred: {
      type: Number,
      default: 0,
      min: 0,
    },
    commissionPercent: {
      type: Number,
      default: 5,
      min: 0,
      max: 100,
    },
    commissionBasis: {
      type: String,
      enum: REFERRAL_COMMISSION_BASES,
      default: "stake",
    },
  },
  { timestamps: true },
);

export const ReferralSetting =
  (models.ReferralSetting as Model<IReferralSetting> | undefined) ??
  model<IReferralSetting>("ReferralSetting", referralSettingSchema);

/** Reads the singleton, creating it with schema defaults on first access. */
export async function getReferralSetting(): Promise<IReferralSetting> {
  return ReferralSetting.findOneAndUpdate(
    { key: REFERRAL_SETTING_KEY },
    { $setOnInsert: { key: REFERRAL_SETTING_KEY } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).lean<IReferralSetting>();
}
