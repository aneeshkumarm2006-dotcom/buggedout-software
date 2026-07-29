import "server-only";

import { Types } from "mongoose";

import { connectDB } from "@/lib/db";
import type { ReferralCommissionBasis } from "@/lib/enums";
import { Transaction, User, getReferralSetting, type IUser } from "@/models";

/**
 * The referrals screen (Phase 5.9): the user's code, who has joined with it,
 * and what it has earned them.
 *
 * Earnings are read straight off the ledger rather than kept as a running total
 * on the user — `referral_commission` rows are the only record of a commission,
 * and a second copy could only ever disagree with them.
 */
export type ReferredUser = {
  id: string;
  username: string;
  joinedAt: string;
};

export type ReferralSummary = {
  code: string;
  referredCount: number;
  recent: ReferredUser[];
  /** Total ever credited by `referral_commission`, signup bonuses included. */
  totalEarned: number;
  payouts: number;
  program: {
    enabled: boolean;
    signupBonusReferrer: number;
    signupBonusReferred: number;
    commissionPercent: number;
    commissionBasis: ReferralCommissionBasis;
  };
};

const RECENT_REFERRALS = 10;

export async function getReferralSummary(
  userId: string | Types.ObjectId,
  referralCode: string,
): Promise<ReferralSummary> {
  await connectDB();

  const id = toObjectId(userId);

  const [referredCount, recent, earnings, setting] = await Promise.all([
    User.countDocuments({ referredBy: id }),
    User.find({ referredBy: id })
      .select("username createdAt")
      .sort({ createdAt: -1 })
      .limit(RECENT_REFERRALS)
      .lean<Pick<IUser, "_id" | "username" | "createdAt">[]>(),
    Transaction.aggregate<{ _id: null; total: number; payouts: number }>([
      { $match: { userId: id, type: "referral_commission" } },
      { $group: { _id: null, total: { $sum: "$amount" }, payouts: { $sum: 1 } } },
    ]),
    getReferralSetting(),
  ]);

  return {
    code: referralCode,
    referredCount,
    recent: recent.map((user) => ({
      id: user._id.toString(),
      username: user.username,
      joinedAt: user.createdAt.toISOString(),
    })),
    totalEarned: earnings[0]?.total ?? 0,
    payouts: earnings[0]?.payouts ?? 0,
    program: {
      enabled: setting.enabled,
      signupBonusReferrer: setting.signupBonusReferrer,
      signupBonusReferred: setting.signupBonusReferred,
      commissionPercent: setting.commissionPercent,
      commissionBasis: setting.commissionBasis,
    },
  };
}

function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return typeof value === "string" ? new Types.ObjectId(value) : value;
}
