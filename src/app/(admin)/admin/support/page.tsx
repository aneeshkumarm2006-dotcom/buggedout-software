import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, LifeBuoyIcon } from "lucide-react";

import { ListToolbar } from "@/components/admin/list-toolbar";
import { EmptyState } from "@/components/common/empty-state";
import { LocalTime } from "@/components/common/local-time";
import { PageHeader } from "@/components/common/page-header";
import { PaginationNav } from "@/components/common/pagination-nav";
import { SegmentedNav } from "@/components/common/segmented-nav";
import { TicketStatusBadge } from "@/components/common/status-badge";
import { requireAdminPage } from "@/lib/admin/guard";
import {
  buildAdminHref,
  parseFilter,
  parsePage,
  parseSearch,
  type SearchParamsRecord,
} from "@/lib/admin/list-params";
import { listTickets } from "@/lib/admin/support";
import { SUPPORT_TICKET_STATUSES, type SupportTicketStatus } from "@/lib/enums";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Support" };

const PATH = "/admin/support";

const TAB_LABELS: Record<"all" | SupportTicketStatus, string> = {
  all: "All",
  open: "Open",
  answered: "Answered",
  replied: "Replied",
  closed: "Closed",
};

/**
 * The support queue (Phase 6.14).
 *
 * The tabs are links, not client state — the tab *is* the query, so the server
 * fetches only the slice being looked at and the choice survives a refresh or a
 * shared URL. The counts on them come from one grouped aggregation, so they are
 * always the real totals rather than what happens to be on this page.
 */
export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireAdminPage(["support.view", "support.reply"]);
  const params = await searchParams;

  const page = parsePage(params.page);
  const q = parseSearch(params.q);
  const status = parseFilter<SupportTicketStatus>(params.status, SUPPORT_TICKET_STATUSES);

  const tickets = await listTickets({ page, q, status });
  const query = { q, status };

  const tabs = (["all", ...SUPPORT_TICKET_STATUSES] as const).map((tab) => ({
    value: tab,
    label: TAB_LABELS[tab],
    href: buildAdminHref(PATH, { q, status: tab === "all" ? undefined : tab }),
    count: tickets.counts[tab],
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Support"
        description="Open and replied tickets are waiting on you. Answering moves a ticket back to the user."
      />

      <SegmentedNav
        items={tabs}
        active={status ?? "all"}
        ariaLabel="Ticket status"
        className="max-w-2xl"
      />

      <ListToolbar pathname={PATH} params={query} searchPlaceholder="Subject, name or email…" />

      {tickets.rows.length === 0 ? (
        <EmptyState
          icon={LifeBuoyIcon}
          title={q || status ? "Nothing matches those filters" : "The queue is empty"}
          description={
            q || status
              ? "Try another tab, or clear the search."
              : "Tickets raised from the user site land here."
          }
        />
      ) : (
        <ul className="grid gap-2.5">
          {tickets.rows.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`${PATH}/${ticket.id}`}
                className={cn(
                  "group focus-visible:ring-ring/50 bg-card ring-foreground/10 hover:bg-card/70 flex items-center gap-3 rounded-xl px-4 py-3 ring-1 transition-colors focus-visible:ring-3 focus-visible:outline-none",
                  ticket.awaitingStaff && "border-primary/40 border-l-4",
                )}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <TicketStatusBadge status={ticket.status} />
                    <span className="text-sm font-medium">{ticket.username}</span>
                    <span className="text-muted-foreground text-xs">
                      <LocalTime value={ticket.lastMessageAt} format="short" />
                      {" · "}
                      {ticket.messageCount} message{ticket.messageCount === 1 ? "" : "s"}
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
      )}

      <PaginationNav
        page={tickets.page}
        totalPages={tickets.totalPages}
        totalItems={tickets.total}
        itemLabel="tickets"
        buildHref={(pageNumber) => buildAdminHref(PATH, { ...query, page: pageNumber })}
      />
    </div>
  );
}
