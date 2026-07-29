import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRightIcon, LifeBuoyIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { LocalTime } from "@/components/common/local-time";
import { PageHeader } from "@/components/common/page-header";
import { PaginationNav } from "@/components/common/pagination-nav";
import { TicketStatusBadge } from "@/components/common/status-badge";
import { NewTicketForm } from "@/components/support/new-ticket-form";
import { auth } from "@/auth";
import { parsePageParam } from "@/lib/search-params";
import { getUserTickets } from "@/lib/support";

export const metadata: Metadata = { title: "Support" };

/**
 * Support (Phase 5.10): the user's own tickets, and the form to raise one.
 *
 * The list is scoped by `userId` in the query — a ticket id is guessable, so
 * ownership is part of what is fetched rather than something checked after.
 */
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { page: requestedPage } = await searchParams;
  const page = parsePageParam(requestedPage);

  const tickets = await getUserTickets(session.user.id, { page });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Support"
        description="Stuck on something? Open a ticket and the team will pick it up."
      />

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Your tickets</h2>

        {tickets.tickets.length === 0 ? (
          <EmptyState
            icon={LifeBuoyIcon}
            title="No tickets yet"
            description="Anything you raise will show up here with the replies attached."
          />
        ) : (
          <>
            <ul className="grid gap-2.5">
              {tickets.tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    href={`/support/${ticket.id}`}
                    className="group focus-visible:ring-ring/50 bg-card ring-foreground/10 hover:bg-card/80 flex items-center gap-3 rounded-xl px-4 py-3 ring-1 transition-colors focus-visible:ring-3 focus-visible:outline-none"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <TicketStatusBadge status={ticket.status} />
                        <span className="text-muted-foreground text-xs">
                          <LocalTime value={ticket.lastMessageAt} format="short" />
                        </span>
                      </div>

                      <p className="truncate font-medium">{ticket.subject}</p>
                      <p className="text-muted-foreground truncate text-xs">{ticket.preview}</p>
                    </div>

                    <ChevronRightIcon className="text-muted-foreground group-hover:text-foreground size-5 shrink-0 transition-colors" />
                  </Link>
                </li>
              ))}
            </ul>

            <PaginationNav
              page={tickets.page}
              totalPages={tickets.totalPages}
              totalItems={tickets.total}
              itemLabel="tickets"
              buildHref={(pageNumber) =>
                pageNumber > 1 ? `/support?page=${pageNumber}` : "/support"
              }
            />
          </>
        )}
      </section>

      <section className="bg-card ring-foreground/10 space-y-4 rounded-xl px-5 py-4 ring-1">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-semibold">New ticket</h2>
          <p className="text-muted-foreground text-sm">
            One subject per ticket, please — it keeps the thread readable.
          </p>
        </div>

        <NewTicketForm />
      </section>
    </div>
  );
}
