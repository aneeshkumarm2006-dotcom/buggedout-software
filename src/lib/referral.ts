import "server-only";

import type { Types } from "mongoose";

import { connectDB } from "@/lib/db";
import type { BetStatus } from "@/lib/enums";
import { applyWalletMovement } from "@/lib/wallet";
import { getReferralSetting, type IReferralSetting } from "@/models";

/**
 * Referral rewards (Phase 4.7). Two moments pay out, both driven by the
 * ReferralSetting singleton:
 *
 *  - signup — a flat bonus to the referrer, optionally one to the new account,
 *    paid once when the code is used (Phase 3.1 only recorded `referredBy`);
 *  - settlement — a percentage of each settled bet the referred user placed,
 *    taken from either the stake or the winnings.
 *
 * Nothing here is allowed to fail loudly: a referral is a bonus on top of an
 * operation that has already succeeded, so every entry point swallows its
 * errors after logging them. A missed commission is fixed with an
 * `admin_credit`, a failed signup is not fixable at all.
 */

export type ReferralSignupRewards = {
  referrerAmount: number;
  referredAmount: number;
};

/** Paid when a new account signs up with someone's referral code. */
export async function creditReferralSignupRewards(input: {
  referredUserId: string | Types.ObjectId;
  referrerId: string | Types.ObjectId;
}): Promise<ReferralSignupRewards> {
  const paid: ReferralSignupRewards = { referrerAmount: 0, referredAmount: 0 };

  let setting: IReferralSetting;
  try {
    await connectDB();
    setting = await getReferralSetting();
  } catch (error) {
    console.error("[referral] could not read the referral settings", error);
    return paid;
  }

  if (!setting.enabled) return paid;

  // Two independent payments: the referrer's bonus failing must not cost the
  // new account its own.
  try {
    if (setting.signupBonusReferrer > 0) {
      await applyWalletMovement({
        userId: input.referrerId,
        type: "referral_commission",
        amount: setting.signupBonusReferrer,
        refId: input.referredUserId,
        note: "Referral signup bonus",
      });
      paid.referrerAmount = setting.signupBonusReferrer;
    }
  } catch (error) {
    console.error("[referral] failed to credit the referrer's signup bonus", error);
  }

  try {
    if (setting.signupBonusReferred > 0) {
      await applyWalletMovement({
        userId: input.referredUserId,
        type: "referral_commission",
        amount: setting.signupBonusReferred,
        refId: input.referrerId,
        note: "Bonus for joining with a referral code",
      });
      paid.referredAmount = setting.signupBonusReferred;
    }
  } catch (error) {
    console.error("[referral] failed to credit the new account's referral bonus", error);
  }

  return paid;
}

export type CommissionableBet = {
  status: BetStatus;
  stake: number;
  payout: number;
};

/**
 * Coins owed to the referrer for one settled bet.
 *
 * `stake` basis is a rake on volume — it applies to every bet that reached a
 * win/lose outcome. `winnings` basis is a cut of profit, so it only applies to
 * a winning bet and only to the part above the stake. Refunded and void bets
 * never earn a commission: nothing was actually wagered.
 *
 * Rounded down, so a commission can never exceed its stated percentage.
 */
export function referralCommissionAmount(
  setting: Pick<IReferralSetting, "enabled" | "commissionPercent" | "commissionBasis">,
  bet: CommissionableBet,
): number {
  if (!setting.enabled || setting.commissionPercent <= 0) return 0;

  const basis =
    setting.commissionBasis === "winnings"
      ? bet.status === "won"
        ? Math.max(0, bet.payout - bet.stake)
        : 0
      : bet.status === "won" || bet.status === "lost"
        ? bet.stake
        : 0;

  if (basis <= 0) return 0;

  return Math.floor((basis * setting.commissionPercent) / 100);
}

/**
 * Credits one settled bet's commission to the referrer. Returns the amount
 * paid — `0` covers "no referrer", "referrals off" and "rounded to nothing"
 * alike, none of which is worth distinguishing at the call site.
 */
export async function creditReferralCommission(input: {
  referrerId: string | Types.ObjectId;
  betId: string | Types.ObjectId;
  bettorName?: string | null;
  setting: Pick<IReferralSetting, "enabled" | "commissionPercent" | "commissionBasis">;
  bet: CommissionableBet;
}): Promise<number> {
  const amount = referralCommissionAmount(input.setting, input.bet);
  if (amount <= 0) return 0;

  try {
    await applyWalletMovement({
      userId: input.referrerId,
      type: "referral_commission",
      amount,
      // Points at the bet that earned it, so the commission log (Phase 6.11)
      // can join straight back to the wager.
      refId: input.betId,
      note: input.bettorName
        ? `Referral commission from ${input.bettorName}`
        : "Referral commission",
    });

    return amount;
  } catch (error) {
    console.error("[referral] failed to credit commission for bet", String(input.betId), error);
    return 0;
  }
}
