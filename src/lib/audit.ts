import "server-only";

import { Types } from "mongoose";

import { connectDB } from "@/lib/db";
import type { AuditEntityType } from "@/lib/enums";
import { getClientIp } from "@/lib/rate-limit";
import type { Role } from "@/lib/roles";
import { AuditLog } from "@/models";

/**
 * Audit trail for admin mutations. Phase 4 needs it for settlement (4.4) and
 * voids (4.5); Phase 6.1 wires the same helper into every other admin action.
 *
 * Writing a row must never be able to undo the thing it is recording — a
 * settlement that has already paid out coins is not going to be rolled back
 * because the log insert failed — so failures are logged and swallowed.
 */
export type AuditEntry = {
  actorId: string | Types.ObjectId;
  actorRole: Role;
  /** Dot-namespaced verb, e.g. `question.resolve`, `match.cancel`. */
  action: string;
  entityType: AuditEntityType;
  entityId?: string | Types.ObjectId | null;
  metadata?: Record<string, unknown> | null;
};

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await connectDB();

    await AuditLog.create({
      actorId: toObjectId(entry.actorId),
      actorRole: entry.actorRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ? toObjectId(entry.entityId) : null,
      metadata: entry.metadata ?? null,
      ip: await clientIp(),
    });
  } catch (error) {
    console.error(`[audit] failed to record ${entry.action}`, error);
  }
}

/** `headers()` only exists inside a request, so seed scripts and jobs get `null`. */
async function clientIp(): Promise<string | null> {
  try {
    return await getClientIp();
  } catch {
    return null;
  }
}

function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return typeof value === "string" ? new Types.ObjectId(value) : value;
}
