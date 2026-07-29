import { z } from "zod";

import { AUDIT_ENTITY_TYPES } from "@/lib/enums";
import { ROLES } from "@/lib/roles";

import { objectId } from "@/schemas/common";

/** Append-only, so there is no update shape. */
export const createAuditLogSchema = z.object({
  actorId: objectId,
  actorRole: z.enum(ROLES),
  action: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-zA-Z]*\.[a-z][a-zA-Z_]*$/, "Use `entity.verb`, e.g. `question.resolve`"),
  entityType: z.enum(AUDIT_ENTITY_TYPES),
  entityId: objectId.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  ip: z.string().trim().max(64).optional(),
});

export const auditLogQuerySchema = z.object({
  actorId: objectId.optional(),
  entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
  entityId: objectId.optional(),
  action: z.string().trim().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateAuditLogInput = z.infer<typeof createAuditLogSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
