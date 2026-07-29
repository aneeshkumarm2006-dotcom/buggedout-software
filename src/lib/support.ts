import "server-only";

import { Types } from "mongoose";

import { connectDB } from "@/lib/db";
import type { SupportSenderType, SupportTicketStatus } from "@/lib/enums";
import { SupportTicket, type ISupportTicket } from "@/models";

/**
 * Support tickets, user side (Phase 5.10). Staff get the other half in 6.14.
 *
 * The status is the conversation's turn: `open` when raised, `answered` once
 * staff have replied, `replied` when the user has come back, `closed` when
 * staff are done. Every read here is scoped by `userId` in the query itself —
 * a ticket id is guessable, so ownership can't be checked after the fact.
 */
export type TicketListItem = {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  lastMessageAt: string;
  createdAt: string;
  messageCount: number;
  /** First line of the latest message, for the list row. */
  preview: string;
};

export type TicketMessage = {
  id: string;
  senderType: SupportSenderType;
  body: string;
  createdAt: string;
};

export type TicketThread = {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  createdAt: string;
  messages: TicketMessage[];
  /** A closed ticket is read-only; a new question means a new ticket. */
  canReply: boolean;
};

export type TicketPage = {
  tickets: TicketListItem[];
  page: number;
  totalPages: number;
  total: number;
};

export const TICKETS_PER_PAGE = 15;

export async function getUserTickets(
  userId: string | Types.ObjectId,
  options: { page?: number; limit?: number } = {},
): Promise<TicketPage> {
  await connectDB();

  const id = toObjectId(userId);
  const limit = options.limit ?? TICKETS_PER_PAGE;
  const page = Math.max(1, options.page ?? 1);

  const [total, tickets] = await Promise.all([
    SupportTicket.countDocuments({ userId: id }),
    SupportTicket.find({ userId: id })
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<ISupportTicket[]>(),
  ]);

  return {
    tickets: tickets.map((ticket) => {
      const latest = ticket.messages.at(-1);

      return {
        id: ticket._id.toString(),
        subject: ticket.subject,
        status: ticket.status,
        lastMessageAt: ticket.lastMessageAt.toISOString(),
        createdAt: ticket.createdAt.toISOString(),
        messageCount: ticket.messages.length,
        preview: latest ? `${latest.senderType === "staff" ? "Support: " : ""}${latest.body}` : "",
      };
    }),
    page,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getUserTicket(
  userId: string | Types.ObjectId,
  ticketId: string,
): Promise<TicketThread | null> {
  await connectDB();

  if (!Types.ObjectId.isValid(ticketId)) return null;

  // Ownership is part of the filter, not a check afterwards.
  const ticket = await SupportTicket.findOne({
    _id: new Types.ObjectId(ticketId),
    userId: toObjectId(userId),
  }).lean<ISupportTicket>();

  if (!ticket) return null;

  return {
    id: ticket._id.toString(),
    subject: ticket.subject,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    messages: ticket.messages.map((message) => ({
      id: message._id.toString(),
      senderType: message.senderType,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    })),
    canReply: ticket.status !== "closed",
  };
}

/** Stops one account from filling the queue faster than staff can read it. */
export const MAX_OPEN_TICKETS_PER_USER = 5;

export type CreateTicketResult =
  | { ok: true; ticketId: string }
  | { ok: false; message: string };

export async function createTicket(
  userId: string | Types.ObjectId,
  input: { subject: string; message: string },
): Promise<CreateTicketResult> {
  await connectDB();

  const id = toObjectId(userId);

  const openTickets = await SupportTicket.countDocuments({
    userId: id,
    status: { $ne: "closed" },
  });

  if (openTickets >= MAX_OPEN_TICKETS_PER_USER) {
    return {
      ok: false,
      message: `You already have ${openTickets} open tickets. Reply on one of those instead.`,
    };
  }

  const now = new Date();

  const ticket = await SupportTicket.create({
    userId: id,
    subject: input.subject,
    status: "open",
    messages: [{ senderId: id, senderType: "user", body: input.message, createdAt: now }],
    lastMessageAt: now,
  });

  return { ok: true, ticketId: ticket._id.toString() };
}

export type ReplyResult = { ok: true } | { ok: false; message: string };

/**
 * Appends the user's reply and hands the ticket back to staff.
 *
 * The status only moves `answered → replied`: a ticket still `open` has never
 * been picked up, and marking it `replied` would make it look like it had.
 */
export async function replyToTicket(
  userId: string | Types.ObjectId,
  ticketId: string,
  body: string,
): Promise<ReplyResult> {
  await connectDB();

  if (!Types.ObjectId.isValid(ticketId)) {
    return { ok: false, message: "That ticket no longer exists." };
  }

  const id = toObjectId(userId);
  const now = new Date();

  const updated = await SupportTicket.findOneAndUpdate(
    {
      _id: new Types.ObjectId(ticketId),
      userId: id,
      status: { $ne: "closed" },
    },
    {
      $push: { messages: { senderId: id, senderType: "user", body, createdAt: now } },
      $set: { lastMessageAt: now },
    },
    { returnDocument: "after" },
  ).lean<ISupportTicket>();

  if (!updated) {
    const exists = await SupportTicket.exists({
      _id: new Types.ObjectId(ticketId),
      userId: id,
    });

    return {
      ok: false,
      message: exists
        ? "This ticket has been closed. Open a new one if you still need help."
        : "That ticket no longer exists.",
    };
  }

  if (updated.status === "answered") {
    await SupportTicket.updateOne(
      { _id: updated._id, status: "answered" },
      { $set: { status: "replied" } },
    );
  }

  return { ok: true };
}

function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return typeof value === "string" ? new Types.ObjectId(value) : value;
}
