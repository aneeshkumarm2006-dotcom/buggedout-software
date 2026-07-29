import { Schema, model, models, type Model, type Types } from "mongoose";

import { USER_STATUSES, type UserStatus } from "@/lib/enums";
import { ROLES, type Role } from "@/lib/roles";

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  /** bcrypt hash — `select: false`, so it is absent unless explicitly selected. */
  passwordHash: string;
  username: string;
  avatar: string | null;
  role: Role;
  permissions: string[];
  /**
   * Free virtual coins. NEVER write this directly — the wallet service
   * (Phase 3.4) is the only code allowed to change it, so that every movement
   * lands in the Transaction ledger with a `balanceAfter`.
   */
  coinBalance: number;
  status: UserStatus;
  referralCode: string;
  referredBy: Types.ObjectId | null;
  lastDailyBonusAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
const REFERRAL_CODE_LENGTH = 8;

/**
 * Random referral code. Collisions are possible but vanishingly rare; signup
 * (Phase 3.1) retries on a duplicate-key error rather than pre-checking.
 */
export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    code += REFERRAL_CODE_ALPHABET[Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    avatar: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ROLES,
      default: "user",
      index: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    coinBalance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: USER_STATUSES,
      default: "active",
      index: true,
    },
    referralCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      default: generateReferralCode,
    },
    referredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    lastDailyBonusAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Leaderboard and user-list sorts.
userSchema.index({ coinBalance: -1 });
userSchema.index({ createdAt: -1 });

export const User = (models.User as Model<IUser> | undefined) ?? model<IUser>("User", userSchema);
