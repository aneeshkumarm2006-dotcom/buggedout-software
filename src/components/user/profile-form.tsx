"use client";

import { useActionState } from "react";

import { updateProfileAction } from "@/app/(user)/actions";
import { FormAlert, SubmitButton, TextField } from "@/components/auth/form-parts";
import { ImageUploadField } from "@/components/common/image-upload-field";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fieldError, idleFormState } from "@/lib/form";
import { initials } from "@/lib/format";

/**
 * Username and avatar (Phase 5.11).
 *
 * The avatar used to be a URL field, because there was nowhere to put a file.
 * It now shares `ImageUploadField` with the admin panel — the `avatar` preset is
 * the one that needs no permission beyond being signed in, so a player uploads
 * through the same endpoint an admin uses for crests.
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

      <ImageUploadField
        label="Picture"
        name="avatar"
        preset="avatar"
        placeholder="https://… — or upload"
        defaultValue={currentAvatar}
        error={fieldError(state, "avatar")}
        hint="Optional. Clear it to go back to your initials."
      />

      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
