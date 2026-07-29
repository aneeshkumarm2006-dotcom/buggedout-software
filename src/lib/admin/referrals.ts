import "server-only";

import { Types, type QueryFilter } from "mongoose";

import {
  ADMIN_PAGE_SIZE,
  pageSlice,
  searchRegex,
  totalPages,
  type Paged,
} from "@/lib/admin/list-params";
import type { MutationResult } from "@/lib/admin/shared";
import { connectDB } from "@/lib/db";
import type { ReferralCommissionBasis } from "@/lib/enums";
import {
  Bet,
  ReferralSetting,
  REFERRAL_SETTING_KEY,
  Transaction,
  User,
  getReferralSetting,
  type IBet,
  type IReferralSetting,
  type ITransaction,
  type IUser,
} from "@/models";
import type { UpdateReferralSettingInput } from "@/schemas/referral-setting";

/**
 * The referral programme (Phase 6.11): its settings, and the log of what it has
 * paid out.
 *
 * The log is read straight off the `referral_commission` rows in the ledger.
 * There is no separate commissions table, and there deliberately isn't one — a
 * second record of the same money could only ever disagree with the ledger, and
 * the ledger is the one that has to be right.
 */
export type ReferralSettings = {
  enabled: boolean;
  signupBonusReferrer: number;
  signupBonusReferred: number;
  commissionPercent: number;
  commissionBasis: ReferralCommissionBasis;
  updatedAt: string;
};

export async function getReferralSettings(): Promise<ReferralSettings> {
  await connectDB();

  const setting = await getReferralSetting();

  return {
    enabled: setting.enabled,
    signupBonusReferrer: setting.signupBonusReferrer,
    signupBonusReferred: setting.signupBonusReferred,
    commissionPercent: setting.commissionPercent,
    commissionBasis: setting.commissionBasis,
    updatedAt: setting.updatedAt.toISOString(),
  };
}

export async function updateReferralSettings(
  input: UpdateReferralSettingInput,
): Promise<MutationResult<ReferralSettings>> {
  await connectDB();

  // Upserted on the singleton key, so this cannot fork the config even if two
  // admins save at the same moment — the unique index decides.
  const updated = await ReferralSetting.findOneAndUpdate(
    { key: REFERRAL_SETTING_KEY },
    { $set: input, $setOnInsert: { key: REFERRAL_SETTING_KEY } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, runValidators: true },
  ).lean<IReferralSetting>();

  return {
    ok: true,
    data: {
      enabled: updated.enabled,
      signupBonusReferrer: updated.signupBonusReferrer,
      signupBonusReferred: updated.signupBonusReferred,
      commissionPercent: updated.commissionPercent,
      commissionBasis: updated.commissionBasis,
      updatedAt: updated.updatedAt.toISOString(),
    },
  };
}

export type CommissionRow = {
  id: string;
  referrerId: string;
  referrerName: string;
  amount: number;
  note: string | null;
  /** The bet or account this commission came from, when it still exists. */
  sourceLabel: string | null;
  sourceMatchId: string | null;
  createdAt: string;
};

export type CommissionParams = { page?: number; q?: string };

export type CommissionSummary = {
  totalPaid: number;
  payouts: number;
  /** Accounts that were signed up with someone's code. */
  referredAccounts: number;
  activeReferrers: number;
};

export async function listCommissions(
  params: CommissionParams = {},
): Promise<Paged<CommissionRow> & { summary: CommissionSummary }> {
  await connectDB();

  const { skip, limit } = pageSlice(params.page ?? 1);
  const filter: QueryFilter<ITransaction> = { type: "referral_commission" };

  if (params.q) {
    const regex = searchRegex(params.q);
    const users = await User.find({ $or: [{ username: regex }, { email: regex }] })
      .select("_id")
      .limit(200)
      .lean<{ _id: Types.ObjectId }[]>();

    filter.userId = { $in: users.map((user) => user._id) };
  }

  const [total, rows, totals, referredAccounts, activeReferrers] = await Promise.all([
    Transaction.countDocuments(filter),
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<ITransaction[]>(),
    Transaction.aggregate<{ _id: null; total: number; payouts: number }>([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$amount" }, payouts: { $sum: 1 } } },
    ]),
    User.countDocuments({ referredBy: { $ne: null } }),
    Transaction.distinct("userId", { type: "referral_commission" }),
  ]);

  const [referrers, sourceBets] = await Promise.all([
    User.find({ _id: { $in: rows.map((row) => row.userId) } })
      .select("username")
      .lean<Pick<IUser, "_id" | "username">[]>(),
    // `refId` points at the bet that earned the commission (4.7); a signup
    // bonus points at a user instead, which simply won't match here.
    Bet.find({ _id: { $in: rows.flatMap((row) => (row.refId ? [row.refId] : [])) } })
      .select("optionName stake matchId")
      .lean<Pick<IBet, "_id" | "optionName" | "stake" | "matchId">[]>(),
  ]);

  const referrerById = new Map(referrers.map((user) => [user._id.toString(), user.username]));
  const betById = new Map(sourceBets.map((bet) => [bet._id.toString(), bet]));

  const summary = totals[0];

  return {
    rows: rows.map((row) => {
      const bet = row.refId ? betById.get(row.refId.toString()) : undefined;

      return {
        id: row._id.toString(),
        referrerId: row.userId.toString(),
        referrerName: referrerById.get(row.userId.toString()) ?? "Deleted account",
        amount: row.amount,
        note: row.note,
        sourceLabel: bet ? `${bet.optionName} · ${bet.stake} staked` : null,
        sourceMatchId: bet?.matchId.toString() ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    }),
    page: params.page ?? 1,
    total,
    totalPages: totalPages(total, ADMIN_PAGE_SIZE),
    summary: {
      totalPaid: summary?.total ?? 0,
      payouts: summary?.payouts ?? 0,
      referredAccounts,
      activeReferrers: activeReferrers.length,
    },
  };
}
