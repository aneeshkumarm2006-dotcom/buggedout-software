import { Schema, model, models, type Model, type Types } from "mongoose";

import { AUDIT_ENTITY_TYPES, type AuditEntityType } from "@/lib/enums";

import type { Role } from "@/lib/roles";

/**
 * Append-only record of every admin mutation. Written by the admin action layer
 * (Phase 6.1) — create, update, delete, resolve, void, ban, coin adjustment.
 * Same immutability rule as the coin ledger: nothing edits or removes a row.
 */
export interface IAuditLog {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  /** Snapshot — the actor's role may change later, the log should not. */
  actorRole: Role;
  /** Dot-namespaced verb, e.g. `match.update`, `question.resolve`, `user.ban`. */
  action: string;
  entityType: AuditEntityType;
  entityId: Types.ObjectId | null;
  /** Free-form diff/context: `{ before, after }`, payout totals, ban reason, … */
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorRole: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: AUDIT_ENTITY_TYPES,
      required: true,
      index: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

function rejectAuditMutation(): never {
  throw new Error("Audit log entries are immutable.");
}

auditLogSchema.pre("save", function () {
  if (!this.isNew) rejectAuditMutation();
});

auditLogSchema.pre(
  [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "findOneAndReplace",
    "replaceOne",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
  ],
  { query: true, document: false },
  rejectAuditMutation,
);

export const AuditLog =
  (models.AuditLog as Model<IAuditLog> | undefined) ?? model<IAuditLog>("AuditLog", auditLogSchema);
