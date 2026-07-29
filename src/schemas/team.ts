import { z } from "zod";

import { CONTENT_STATUSES } from "@/lib/enums";

import { imagePath, selectedObjectId } from "@/schemas/common";

const baseTeamSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  categoryId: selectedObjectId,
  // Already cropped in the browser and stored by `lib/storage` — this only
  // checks the shape of the reference that came back.
  image: imagePath,
  status: z.enum(CONTENT_STATUSES),
});

export const createTeamSchema = baseTeamSchema.partial({ status: true });

export const updateTeamSchema = baseTeamSchema.partial();

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
