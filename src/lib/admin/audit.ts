import "server-only";

import { Types, type QueryFilter } from "mongoose";

import {
  ADMIN_PAGE_SIZE,
  pageSlice,
  searchRegex,
  totalPages,
  type Paged,
} from "@/lib/admin/list-params";
import { connectDB } from "@/lib/db";
import type { AuditEntityType } from "@/lib/enums";
import type { Role } from "@/lib/roles";
import { AuditLog, User, type IAuditLog, type IUser } from "@/models";

/**
 * The audit trail (Phase 6.1's "all mutations audit-log", surfaced as a screen).
 *
 * Append-only at the model level — the schema rejects every update and delete —
 * so this is the record of who changed what, from which address, and when. The
 * metadata blob differs per action by design; the UI renders it as key/value
 * pairs rather than pretending it has a fixed shape.
 */
export type AuditRow = {
  id: string;
  action: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  entityType: AuditEntityType;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
};

export type AuditParams = {
  page?: number;
  q?: string;
  entityType?: AuditEntityType;
  actorId?: string;
};

export async function listAuditLog(params: AuditParams = {}): Promise<Paged<AuditRow>> {
  await connectDB();

  const { skip, limit } = pageSlice(params.page ?? 1);
  const filter: QueryFilter<IAuditLog> = {};

  if (params.entityType) filter.entityType = params.entityType;

  if (params.q) {
    const regex = searchRegex(params.q);

    const actors = await User.find({ username: regex })
      .select("_id")
      .limit(200)
      .lean<{ _id: Types.ObjectId }[]>();

    // Either the verb or who did it — an operator searching "ban" and one
    // searching a username both want this list.
    filter.$or = [{ action: regex }, { actorId: { $in: actors.map((actor) => actor._id) } }];
  }

  const [total, rows] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean<IAuditLog[]>(),
  ]);

  const actors = await User.find({ _id: { $in: rows.map((row) => row.actorId) } })
    .select("username")
    .lean<Pick<IUser, "_id" | "username">[]>();

  const actorNameById = new Map(actors.map((user) => [user._id.toString(), user.username]));

  return {
    rows: rows.map((row) => ({
      id: row._id.toString(),
      action: row.action,
      actorId: row.actorId.toString(),
      actorName: actorNameById.get(row.actorId.toString()) ?? "Deleted account",
      actorRole: row.actorRole,
      entityType: row.entityType,
      entityId: row.entityId?.toString() ?? null,
      metadata: row.metadata,
      ip: row.ip,
      createdAt: row.createdAt.toISOString(),
    })),
    page: params.page ?? 1,
    total,
    totalPages: totalPages(total, ADMIN_PAGE_SIZE),
  };
}
