import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckIcon, RotateCcwIcon, UserRoundIcon } from "lucide-react";

import { setTicketStatusAction } from "@/app/(admin)/ops-actions";
import { ActionButton } from "@/components/admin/action-button";
import { TableCard } from "@/components/admin/table-card";
import { TicketReplyForm } from "@/components/admin/ticket-reply-form";
import { LocalTime } from "@/components/common/local-time";
import { PageHeader } from "@/components/common/page-header";
import { TicketStatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { actorCan, requireAdminPage } from "@/lib/admin/guard";
import { getTicketThread } from "@/lib/admin/support";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ticket" };

/**
 * One support thread (Phase 6.14) — the conversation, the reply box, and the
 * close/reopen switch.
 *
 * Staff messages sit on the right and the user's on the left, so whose turn it
 * is reads at a glance without checking every timestamp.
 */
export default async function AdminTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const actor = await requireAdminPage(["support.view", "support.reply"], {
    fallback: "/admin/support",
  });

  const { ticketId } = await params;
  const ticket = await getTicketThread(ticketId);

  if (!ticket) notFound();

  const canReply = actorCan(actor, "support.reply");
  const closed = ticket.status === "closed";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title={ticket.subject}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={ticket.status} />
            <span>{ticket.username}</span>
            <span className="text-muted-foreground text-xs">
              opened <LocalTime value={ticket.createdAt} format="short" />
            </span>
          </span>
        }
        backHref="/admin/support"
        backLabel="Support"
        action={
          canReply ? (
            <ActionButton
              action={setTicketStatusAction.bind(null, ticket.id, closed ? "replied" : "closed")}
              variant={closed ? "outline" : "default"}
              size="lg"
            >
              {closed ? <RotateCcwIcon /> : <CheckIcon />}
              {closed ? "Reopen" : "Close ticket"}
            </ActionButton>
          ) : null
        }
      />

      <TableCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <p className="font-medium">{ticket.username}</p>
          <p className="text-muted-foreground text-xs">{ticket.email}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-muted-foreground text-xs">Balance</p>
            <p className="font-medium tabular-nums">{formatCoins(ticket.coinBalance)}</p>
          </div>

          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/users/${ticket.userId}`}>
              <UserRoundIcon />
              Account
            </Link>
          </Button>
        </div>
      </TableCard>

      <ol className="grid gap-3">
        {ticket.messages.map((message) => {
          const fromStaff = message.senderType === "staff";

          return (
            <li
              key={message.id}
              className={cn("flex", fromStaff ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] space-y-1 rounded-xl px-4 py-3",
                  fromStaff
                    ? "bg-primary/10 ring-primary/20 ring-1"
                    : "bg-card ring-foreground/10 ring-1",
                )}
              >
                <p className="text-muted-foreground flex items-center gap-2 text-xs">
                  <span className="font-medium">
                    {fromStaff ? `${message.senderName} · support` : message.senderName}
                  </span>
                  <LocalTime value={message.createdAt} format="short" />
                </p>

                {/* User-authored text: rendered as text, wrapped on its own
                    newlines. Nothing here interprets markup. */}
                <p className="text-sm whitespace-pre-wrap">{message.body}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {closed ? (
        <TableCard className="p-4 text-sm">
          <p className="text-muted-foreground">
            Closed
            {ticket.closedAt ? (
              <>
                {" "}
                <LocalTime value={ticket.closedAt} format="short" />
              </>
            ) : null}
            {ticket.closedByName ? ` by ${ticket.closedByName}` : ""}. Reopen it to reply.
          </p>
        </TableCard>
      ) : canReply ? (
        <TableCard className="p-4">
          <TicketReplyForm ticketId={ticket.id} />
        </TableCard>
      ) : null}
    </div>
  );
}
