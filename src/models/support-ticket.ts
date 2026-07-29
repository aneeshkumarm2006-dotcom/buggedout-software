import { Schema, model, models, type Model, type Types } from "mongoose";

import {
  SUPPORT_SENDER_TYPES,
  SUPPORT_TICKET_STATUSES,
  type SupportSenderType,
  type SupportTicketStatus,
} from "@/lib/enums";

export interface ISupportMessage {
  _id: Types.ObjectId;
  senderId: Types.ObjectId;
  senderType: SupportSenderType;
  body: string;
  createdAt: Date;
}

/**
 * Status flow (drives the admin tabs in Phase 6.14):
 * `open` on creation → `answered` when staff replies → `replied` when the user
 * writes back → `closed` when staff closes it.
 */
export interface ISupportTicket {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  subject: string;
  status: SupportTicketStatus;
  messages: ISupportMessage[];
  /** Denormalised so the ticket list can sort by activity without unwinding messages. */
  lastMessageAt: Date;
  closedAt: Date | null;
  closedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const supportMessageSchema = new Schema<ISupportMessage>(
  {
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderType: {
      type: String,
      enum: SUPPORT_SENDER_TYPES,
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: true },
);

const supportTicketSchema = new Schema<ISupportTicket>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    status: {
      type: String,
      enum: SUPPORT_TICKET_STATUSES,
      default: "open",
      index: true,
    },
    messages: {
      type: [supportMessageSchema],
      default: [],
    },
    lastMessageAt: {
      type: Date,
      default: () => new Date(),
    },
    closedAt: {
      type: Date,
      default: null,
    },
    closedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

supportTicketSchema.index({ status: 1, lastMessageAt: -1 });
supportTicketSchema.index({ userId: 1, lastMessageAt: -1 });

export const SupportTicket =
  (models.SupportTicket as Model<ISupportTicket> | undefined) ??
  model<ISupportTicket>("SupportTicket", supportTicketSchema);
