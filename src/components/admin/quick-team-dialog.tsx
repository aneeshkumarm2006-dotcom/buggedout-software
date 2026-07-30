"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { quickCreateTeamAction } from "@/app/(admin)/setup-actions";
import { ImageUploadField } from "@/components/common/image-upload-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SetupTeam } from "@/lib/admin/setup";

/**
 * "Add a competitor" without leaving whatever you were building.
 *
 * This is the specific thing that used to stall the old flow. A missing turtle
 * meant abandoning a half-filled match form, walking to the Teams screen,
 * creating it, walking back, and starting the form again — so the panel
 * punished you for not having done the steps in the order the database wanted.
 * Here the row is created in place and handed to `onCreated`, which selects it.
 *
 * Radix portals the dialog to `document.body`, so the `<form>` below is a
 * sibling of whatever form opened it rather than a child — nesting forms is
 * invalid HTML, and this is why it is legal here.
 */
export function QuickTeamDialog({
  categoryId,
  gameTitle,
  onCreated,
  disabled,
  label = "Add a competitor",
}: {
  categoryId: string;
  gameTitle: string;
  onCreated: (team: SetupTeam) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setImage("");
    setError(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = name.trim();

    if (!trimmed) {
      setError("Give the competitor a name.");
      return;
    }

    if (!image) {
      setError("Pick a picture — it's what players tap on.");
      return;
    }

    startTransition(async () => {
      const result = await quickCreateTeamAction({ name: trimmed, categoryId, image });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      toast.success(`${result.team.name} added to ${gameTitle}.`);
      onCreated({ ...result.team, status: "active" });
      setOpen(false);
      reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="lg" disabled={disabled}>
          <PlusIcon />
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Add a competitor to {gameTitle}</DialogTitle>
            <DialogDescription>
              Whatever players are betting on — a turtle, a lane, a door. It stays on this game and
              you can use it on every future event.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="quick-team-name">Name</Label>
              <Input
                id="quick-team-name"
                value={name}
                maxLength={60}
                autoFocus
                placeholder="Turtle A"
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                className="h-11 md:h-10"
              />
            </div>

            {/* No server action consumes this form's FormData — the value is
                read through `onValueChange` and posted by the action call below. */}
            <ImageUploadField
              label="Picture"
              name="quick-team-image"
              preset="team-crest"
              defaultValue={image}
              hint="Cropped to a small circle. A photo from your phone is fine."
              onValueChange={(next) => {
                setImage(next);
                setError(null);
              }}
            />

            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
              Cancel
            </Button>

            <Button type="submit" size="lg" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : null}
              {pending ? "Adding…" : "Add competitor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
