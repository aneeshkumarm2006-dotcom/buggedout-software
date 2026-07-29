import { z } from "zod";

import { SUPPORT_TICKET_STATUSES } from "@/lib/enums";

import { objectId } from "@/schemas/common";

const messageBody = z.string().trim().min(1, "Write a message").max(4000);

export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(140),
  message: messageBody,
});

/** Used by both the user thread (5.10) and the staff reply box (6.14). */
export const replySupportTicketSchema = z.object({
  ticketId: objectId,
  body: messageBody,
});

/** Staff-only status change; the reply flow moves the status on its own. */
export const updateSupportTicketSchema = z.object({
  status: z.enum(SUPPORT_TICKET_STATUSES),
});

export const supportTicketQuerySchema = z.object({
  status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
  userId: objectId.optional(),
});

export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;
export type ReplySupportTicketInput = z.infer<typeof replySupportTicketSchema>;
export type UpdateSupportTicketInput = z.infer<typeof updateSupportTicketSchema>;
export type SupportTicketQuery = z.infer<typeof supportTicketQuerySchema>;
