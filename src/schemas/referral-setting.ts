import { z } from "zod";

import { REFERRAL_COMMISSION_BASES } from "@/lib/enums";

import { checkbox, coinAmount } from "@/schemas/common";

/**
 * Singleton config, so there is only an update shape — the row is upserted with
 * schema defaults on first read (`getReferralSetting`).
 */
export const updateReferralSettingSchema = z.object({
  enabled: checkbox,
  signupBonusReferrer: coinAmount,
  signupBonusReferred: coinAmount,
  commissionPercent: z.coerce
    .number()
    .min(0, "Commission cannot be negative")
    .max(100, "Commission cannot exceed 100%"),
  commissionBasis: z.enum(REFERRAL_COMMISSION_BASES),
});

export type UpdateReferralSettingInput = z.infer<typeof updateReferralSettingSchema>;
