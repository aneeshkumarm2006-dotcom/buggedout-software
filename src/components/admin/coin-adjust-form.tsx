"use client";

import { useActionState } from "react";

import {
  FieldRow,
  FormActions,
  FormAlert,
  FormCard,
  SelectField,
  TextField,
  useFormToast,
} from "@/components/admin/form-parts";
import { fieldError, idleFormState, type FormState } from "@/lib/form";

/**
 * Manual credit or debit (Phase 6.13).
 *
 * The reason is required rather than optional: this is the one place coins
 * appear or vanish without a bet behind them, and the note is what the ledger
 * row — and the audit log — will be read back with in six months.
 */
export function CoinAdjustForm({
  action,
  username,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  username: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleFormState);
  useFormToast(state);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />

      <FormCard
        title="Adjust balance"
        description={`Moves coins in or out of ${username}'s wallet through the ledger, like every other movement.`}
      >
        <FieldRow>
          <SelectField
            label="Direction"
            name="direction"
            defaultValue={state.values?.direction || "credit"}
            options={[
              { value: "credit", label: "Credit — add coins" },
              { value: "debit", label: "Debit — take coins" },
            ]}
            error={fieldError(state, "direction")}
          />

          <TextField
            label="Amount"
            name="amount"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={state.values?.amount ?? ""}
            error={fieldError(state, "amount")}
          />
        </FieldRow>

        <TextField
          label="Reason"
          name="note"
          required
          maxLength={300}
          defaultValue={state.values?.note ?? ""}
          error={fieldError(state, "note")}
          placeholder="Goodwill after the abandoned heat"
          hint="Stored on the ledger row and in the audit log."
        />

        <FormActions pending={pending} submitLabel="Apply adjustment" pendingLabel="Applying…" />
      </FormCard>
    </form>
  );
}
