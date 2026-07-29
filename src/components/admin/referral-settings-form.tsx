"use client";

import { useActionState, useState } from "react";

import {
  CheckboxField,
  FieldRow,
  FormActions,
  FormAlert,
  FormCard,
  TextField,
  useFormToast,
} from "@/components/admin/form-parts";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateReferralSettingsAction } from "@/app/(admin)/ops-actions";
import type { ReferralSettings } from "@/lib/admin/referrals";
import { REFERRAL_COMMISSION_BASES } from "@/lib/enums";
import { fieldError, idleFormState } from "@/lib/form";

/**
 * The referral programme's settings (Phase 6.11).
 *
 * The two bases pay very differently — `stake` is a rake on volume and applies
 * to every settled bet, `winnings` is a cut of profit and only pays on a win —
 * so the explanation under the field changes with the choice rather than
 * describing both at once.
 */
export function ReferralSettingsForm({ settings }: { settings: ReferralSettings }) {
  const [state, formAction, pending] = useActionState(
    updateReferralSettingsAction,
    idleFormState,
  );
  useFormToast(state);

  const [basis, setBasis] = useState(settings.commissionBasis);

  return (
    <form action={formAction} className="grid max-w-2xl gap-4" noValidate>
      <FormAlert state={state} />

      <FormCard title="Programme">
        <CheckboxField
          name="enabled"
          label="Referrals are on"
          description="Switching this off stops new bonuses and commissions. Anything already paid stays paid."
          defaultChecked={settings.enabled}
        />
      </FormCard>

      <FormCard
        title="Signup bonuses"
        description="Paid once, when a new account signs up with someone's code."
      >
        <FieldRow>
          <TextField
            label="To the referrer"
            name="signupBonusReferrer"
            type="number"
            min={0}
            step={1}
            required
            defaultValue={state.values?.signupBonusReferrer ?? String(settings.signupBonusReferrer)}
            error={fieldError(state, "signupBonusReferrer")}
            hint="Coins"
          />

          <TextField
            label="To the new account"
            name="signupBonusReferred"
            type="number"
            min={0}
            step={1}
            required
            defaultValue={state.values?.signupBonusReferred ?? String(settings.signupBonusReferred)}
            error={fieldError(state, "signupBonusReferred")}
            hint="On top of the standard signup bonus"
          />
        </FieldRow>
      </FormCard>

      <FormCard
        title="Ongoing commission"
        description="Credited to the referrer each time a referred user's bet settles."
      >
        <FieldRow>
          <TextField
            label="Rate"
            name="commissionPercent"
            type="number"
            min={0}
            max={100}
            step={0.1}
            required
            defaultValue={state.values?.commissionPercent ?? String(settings.commissionPercent)}
            error={fieldError(state, "commissionPercent")}
            hint="Percent, rounded down"
          />

          <div className="grid gap-1.5">
            <Label htmlFor="commissionBasis">Applied to</Label>

            <Select
              name="commissionBasis"
              value={basis}
              onValueChange={(value) => setBasis(value as ReferralSettings["commissionBasis"])}
            >
              <SelectTrigger id="commissionBasis" className="h-11 w-full md:h-10">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {REFERRAL_COMMISSION_BASES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === "stake" ? "Stake — every settled bet" : "Winnings — profit on a win"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {fieldError(state, "commissionBasis") ? (
              <p className="text-destructive text-xs">{fieldError(state, "commissionBasis")}</p>
            ) : null}
          </div>
        </FieldRow>

        <p className="text-muted-foreground text-xs">
          {basis === "stake"
            ? "Pays on every bet that reaches a win or lose outcome, whichever way it went. Refunded and voided bets never earn a commission — nothing was really wagered."
            : "Pays only on a winning bet, and only on the part above the stake."}
        </p>
      </FormCard>

      <FormActions pending={pending} submitLabel="Save settings" />
    </form>
  );
}
