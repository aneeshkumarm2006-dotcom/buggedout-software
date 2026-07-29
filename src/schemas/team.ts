import { z } from "zod";

import { CONTENT_STATUSES } from "@/lib/enums";

import { imagePath, selectedObjectId } from "@/schemas/common";

const baseTeamSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  categoryId: selectedObjectId,
  // Already resized to 64×64 client-side (Phase 6.6) — this only checks the shape.
  image: imagePath,
  status: z.enum(CONTENT_STATUSES),
});

export const createTeamSchema = baseTeamSchema.partial({ status: true });

export const updateTeamSchema = baseTeamSchema.partial();

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
