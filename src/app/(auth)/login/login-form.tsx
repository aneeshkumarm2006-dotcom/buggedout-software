"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction } from "@/app/(auth)/actions";
import { FormAlert, SubmitButton, TextField } from "@/components/auth/form-parts";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { fieldError, idleFormState } from "@/lib/form";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, idleFormState);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />

      {/* Where the proxy wanted to send them before the login wall got in the way. */}
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}

      {/* `defaultValue` is what a rejected submit restores to — React resets the
          form once the action settles. */}
      <TextField
        label="Email or username"
        name="identifier"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={state.values?.identifier}
        error={fieldError(state, "identifier")}
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldError(state, "password")}
        labelAction={
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Forgot password?
          </Link>
        }
      />

      <div className="flex items-center gap-2">
        {/* Radix renders the hidden native input, so this posts `on` like any checkbox. */}
        {/* Radix keeps its own uncontrolled state and restores it on the form
            reset that follows an action, so a changed answer has to remount. */}
        <Checkbox
          key={state.values?.rememberMe ?? "initial"}
          id="rememberMe"
          name="rememberMe"
          defaultChecked={(state.values?.rememberMe ?? "on") === "on"}
        />
        <Label htmlFor="rememberMe" className="text-muted-foreground text-sm font-normal">
          Keep me logged in
        </Label>
      </div>

      <SubmitButton pending={pending} pendingLabel="Logging in…">
        Log in
      </SubmitButton>
    </form>
  );
}
