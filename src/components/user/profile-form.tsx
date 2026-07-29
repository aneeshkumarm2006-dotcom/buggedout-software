"use client";

import { useActionState } from "react";

import { updateProfileAction } from "@/app/(user)/actions";
import { FormAlert, SubmitButton, TextField } from "@/components/auth/form-parts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fieldError, idleFormState } from "@/lib/form";
import { initials } from "@/lib/format";

/**
 * Username and avatar (Phase 5.11).
 *
 * The avatar is a URL rather than an upload: there is no file storage in the
 * MVP, and the 64×64 client-side resizer arrives with the admin team uploader
 * in 6.6. `updateProfileSchema` accepts a site path, an http(s) URL or a data
 * URL, so this field is forward-compatible with whichever that turns out to be.
 */
export function ProfileForm({
  username,
  avatar,
}: {
  username: string;
  avatar: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateProfileAction, idleFormState);

  // Whatever the user last typed wins over the saved value, so a rejected
  // submit doesn't quietly discard their edit.
  const currentAvatar = state.values?.avatar ?? avatar ?? "";
  const currentUsername = state.values?.username ?? username;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />

      <div className="flex items-center gap-3">
        <Avatar size="lg">
          {currentAvatar ? <AvatarImage src={currentAvatar} alt="" /> : null}
          <AvatarFallback>{initials(currentUsername)}</AvatarFallback>
        </Avatar>
        <p className="text-muted-foreground text-xs">
          Your initials stand in until you add a picture.
        </p>
      </div>

      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        minLength={3}
        maxLength={20}
        required
        defaultValue={currentUsername}
        error={fieldError(state, "username")}
        hint="3–20 characters. Letters, numbers and underscores."
      />

      <TextField
        label="Avatar URL"
        name="avatar"
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="https://…"
        defaultValue={currentAvatar}
        error={fieldError(state, "avatar")}
        hint="Optional. Leave blank to go back to your initials."
      />

      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
