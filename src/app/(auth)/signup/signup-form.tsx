"use client";

import { useActionState } from "react";

import { signupAction } from "@/app/(auth)/actions";
import { FormAlert, SubmitButton, TextField } from "@/components/auth/form-parts";
import { fieldError, idleFormState } from "@/lib/form";

export function SignupForm({
  signupBonus,
  referralCode,
}: {
  signupBonus: number;
  /** Pre-filled from `/signup?ref=CODE` so a shared referral link just works. */
  referralCode?: string;
}) {
  const [state, formAction, pending] = useActionState(signupAction, idleFormState);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />

      {/* `defaultValue` is what a rejected submit restores to — React resets the
          form once the action settles. */}
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        required
        defaultValue={state.values?.email}
        error={fieldError(state, "email")}
      />

      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        placeholder="turtle_king"
        minLength={3}
        maxLength={20}
        required
        defaultValue={state.values?.username}
        error={fieldError(state, "username")}
        hint="3–20 characters. Letters, numbers and underscores."
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        required
        error={fieldError(state, "password")}
        hint="At least 8 characters."
      />

      <TextField
        label="Referral code"
        name="referralCode"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={8}
        defaultValue={state.values?.referralCode ?? referralCode}
        error={fieldError(state, "referralCode")}
        hint="Optional — got a friend's code?"
      />

      <SubmitButton pending={pending} pendingLabel="Creating your account…">
        Create account
      </SubmitButton>

      {signupBonus > 0 ? (
        <p className="text-muted-foreground text-center text-xs">
          <span className="text-primary font-semibold">
            {signupBonus.toLocaleString()} free coins
          </span>{" "}
          land in your wallet the moment you sign up.
        </p>
      ) : null}
    </form>
  );
}
