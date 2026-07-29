import "server-only";

import { Types, type QueryFilter } from "mongoose";

import {
  ADMIN_PAGE_SIZE,
  pageSlice,
  searchRegex,
  totalPages,
  type Paged,
} from "@/lib/admin/list-params";
import { isValidObjectId, toObjectId, type MutationResult } from "@/lib/admin/shared";
import { connectDB } from "@/lib/db";
import type { SupportSenderType, SupportTicketStatus } from "@/lib/enums";
import { SupportTicket, User, type ISupportTicket, type IUser } from "@/models";

/**
 * The support queue, staff side (Phase 6.14). The user's half is `lib/support.ts`.
 *
 * The status is whose turn it is: `open` has never been picked up, `answered`
 * means staff replied last, `replied` means the user came back, `closed` is
 * done. Replying moves it to `answered` in the same update that appends the
 * message, so two staff replying at once can't leave it looking unanswered.
 */
export type TicketRow = {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  username: string;
  userId: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  preview: string;
  /** True when the user spoke last — the tickets actually needing an answer. */
  awaitingStaff: boolean;
};

export type TicketMessage = {
  id: string;
  senderType: SupportSenderType;
  senderName: string;
  body: string;
  createdAt: string;
};

export type TicketThread = {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  userId: string;
  username: string;
  email: string;
  coinBalance: number;
  createdAt: string;
  closedAt: string | null;
  closedByName: string | null;
  messages: TicketMessage[];
};

export type TicketListParams = {
  page?: number;
  q?: string;
  status?: SupportTicketStatus;
};

export type TicketCounts = Record<"all" | SupportTicketStatus, number>;

export async function listTickets(
  params: TicketListParams = {},
): Promise<Paged<TicketRow> & { counts: TicketCounts }> {
  await connectDB();

  const { skip, limit } = pageSlice(params.page ?? 1);
  const filter: QueryFilter<ISupportTicket> = {};

  if (params.status) filter.status = params.status;

  if (params.q) {
    const regex = searchRegex(params.q);

    const users = await User.find({ $or: [{ username: regex }, { email: regex }] })
      .select("_id")
      .limit(200)
      .lean<{ _id: Types.ObjectId }[]>();

    // Subject *or* author, so an operator can search either without knowing which.
    filter.$or = [{ subject: regex }, { userId: { $in: users.map((user) => user._id) } }];
  }

  const [total, tickets, byStatus] = await Promise.all([
    SupportTicket.countDocuments(filter),
    SupportTicket.find(filter)
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<ISupportTicket[]>(),
    SupportTicket.aggregate<{ _id: SupportTicketStatus; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const users = await User.find({ _id: { $in: tickets.map((ticket) => ticket.userId) } })
    .select("username")
    .lean<Pick<IUser, "_id" | "username">[]>();

  const usernameById = new Map(users.map((user) => [user._id.toString(), user.username]));
  const tally = new Map(byStatus.map((row) => [row._id, row.count]));

  return {
    rows: tickets.map((ticket) => {
      const latest = ticket.messages.at(-1);

      return {
        id: ticket._id.toString(),
        subject: ticket.subject,
        status: ticket.status,
        userId: ticket.userId.toString(),
        username: usernameById.get(ticket.userId.toString()) ?? "Deleted account",
        messageCount: ticket.messages.length,
        lastMessageAt: ticket.lastMessageAt.toISOString(),
        createdAt: ticket.createdAt.toISOString(),
        preview: latest ? `${latest.senderType === "staff" ? "You: " : ""}${latest.body}` : "",
        awaitingStaff: ticket.status === "open" || ticket.status === "replied",
      };
    }),
    page: params.page ?? 1,
    total,
    totalPages: totalPages(total, ADMIN_PAGE_SIZE),
    counts: {
      all: [...tally.values()].reduce((sum, count) => sum + count, 0),
      open: tally.get("open") ?? 0,
      answered: tally.get("answered") ?? 0,
      replied: tally.get("replied") ?? 0,
      closed: tally.get("closed") ?? 0,
    },
  };
}

export async function getTicketThread(ticketId: string): Promise<TicketThread | null> {
  await connectDB();

  if (!isValidObjectId(ticketId)) return null;

  const ticket = await SupportTicket.findById(toObjectId(ticketId)).lean<ISupportTicket>();
  if (!ticket) return null;

  // One lookup for the author, every staff member who wrote, and the closer.
  const participantIds = [
    ticket.userId,
    ...ticket.messages.map((message) => message.senderId),
    ...(ticket.closedBy ? [ticket.closedBy] : []),
  ];

  const participants = await User.find({ _id: { $in: participantIds } })
    .select("username email coinBalance")
    .lean<Pick<IUser, "_id" | "username" | "email" | "coinBalance">[]>();

  const byId = new Map(participants.map((user) => [user._id.toString(), user]));
  const author = byId.get(ticket.userId.toString());

  return {
    id: ticket._id.toString(),
    subject: ticket.subject,
    status: ticket.status,
    userId: ticket.userId.toString(),
    username: author?.username ?? "Deleted account",
    email: author?.email ?? "—",
    coinBalance: author?.coinBalance ?? 0,
    createdAt: ticket.createdAt.toISOString(),
    closedAt: ticket.closedAt?.toISOString() ?? null,
    closedByName: ticket.closedBy
      ? (byId.get(ticket.closedBy.toString())?.username ?? "Deleted account")
      : null,
    messages: ticket.messages.map((message) => ({
      id: message._id.toString(),
      senderType: message.senderType,
      senderName:
        byId.get(message.senderId.toString())?.username ??
        (message.senderType === "staff" ? "Support" : "User"),
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

export type TicketMutation = { subject: string; status: SupportTicketStatus };

/**
 * Appends a staff reply and hands the ticket back to the user.
 *
 * The message and the status move in one update, so a reply is never recorded
 * without the ticket showing that it was answered. A closed ticket is not
 * reopened by replying — that would be a surprise to whoever closed it.
 */
export async function replyToTicket(
  staffId: string,
  ticketId: string,
  body: string,
): Promise<MutationResult<TicketMutation>> {
  await connectDB();

  if (!isValidObjectId(ticketId)) return { ok: false, message: "That ticket no longer exists." };

  const now = new Date();

  const updated = await SupportTicket.findOneAndUpdate(
    { _id: toObjectId(ticketId), status: { $ne: "closed" } },
    {
      $push: {
        messages: { senderId: toObjectId(staffId), senderType: "staff", body, createdAt: now },
      },
      $set: { status: "answered", lastMessageAt: now },
    },
    { returnDocument: "after" },
  ).lean<ISupportTicket>();

  if (!updated) {
    const exists = await SupportTicket.exists({ _id: toObjectId(ticketId) });

    return {
      ok: false,
      message: exists
        ? "This ticket is closed. Reopen it before replying."
        : "That ticket no longer exists.",
    };
  }

  return { ok: true, data: { subject: updated.subject, status: updated.status } };
}

export async function setTicketStatus(
  staffId: string,
  ticketId: string,
  status: SupportTicketStatus,
): Promise<MutationResult<TicketMutation>> {
  await connectDB();

  if (!isValidObjectId(ticketId)) return { ok: false, message: "That ticket no longer exists." };

  const closing = status === "closed";

  const updated = await SupportTicket.findByIdAndUpdate(
    toObjectId(ticketId),
    {
      $set: {
        status,
        closedAt: closing ? new Date() : null,
        closedBy: closing ? toObjectId(staffId) : null,
      },
    },
    { returnDocument: "after" },
  ).lean<ISupportTicket>();

  if (!updated) return { ok: false, message: "That ticket no longer exists." };

  return { ok: true, data: { subject: updated.subject, status: updated.status } };
}
