import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { LocalTime } from "@/components/common/local-time";
import { PageHeader } from "@/components/common/page-header";
import { TicketStatusBadge } from "@/components/common/status-badge";
import { ReplyForm } from "@/components/support/reply-form";
import { auth } from "@/auth";
import { getUserTicket } from "@/lib/support";
import { cn } from "@/lib/utils";

type TicketPageProps = { params: Promise<{ ticketId: string }> };

export async function generateMetadata({ params }: TicketPageProps): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.id) return { title: "Support" };

  const { ticketId } = await params;
  const ticket = await getUserTicket(session.user.id, ticketId);

  return { title: ticket?.subject ?? "Support" };
}

/**
 * One ticket thread (Phase 5.10).
 *
 * A ticket belonging to somebody else is a 404, not a 403 — telling a stranger
 * that a ticket exists but isn't theirs is more than they need to know.
 */
export default async function TicketPage({ params }: TicketPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { ticketId } = await params;
  const ticket = await getUserTicket(session.user.id, ticketId);

  if (!ticket) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        backHref="/support"
        backLabel="All tickets"
        title={ticket.subject}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={ticket.status} />
            <span>
              Opened <LocalTime value={ticket.createdAt} format="short" />
            </span>
          </span>
        }
      />

      <ol className="space-y-3">
        {ticket.messages.map((message) => {
          const fromStaff = message.senderType === "staff";

          return (
            <li
              key={message.id}
              className={cn("flex", fromStaff ? "justify-start" : "justify-end")}
            >
              <div
                className={cn(
                  "max-w-[85%] space-y-1 rounded-xl px-3.5 py-2.5 text-sm",
                  fromStaff
                    ? "bg-card ring-foreground/10 ring-1"
                    : "bg-primary/10 text-foreground",
                )}
              >
                <p className="text-muted-foreground text-xs font-medium">
                  {fromStaff ? "Support" : "You"}
                  <span className="ml-1.5 font-normal">
                    <LocalTime value={message.createdAt} format="short" />
                  </span>
                </p>
                {/* Plain text from a textarea: newlines are the only formatting,
                    and `whitespace-pre-wrap` renders them without any parsing. */}
                <p className="whitespace-pre-wrap">{message.body}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {ticket.canReply ? (
        <section className="bg-card ring-foreground/10 rounded-xl px-4 py-4 ring-1">
          <ReplyForm ticketId={ticket.id} />
        </section>
      ) : (
        <p className="border-border text-muted-foreground rounded-xl border border-dashed px-4 py-3 text-sm">
          This ticket is closed. Open a new one if you still need a hand.
        </p>
      )}
    </div>
  );
}
