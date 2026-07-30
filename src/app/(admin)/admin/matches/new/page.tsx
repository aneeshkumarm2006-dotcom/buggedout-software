import type { Metadata } from "next";

import { createMatchAction } from "@/app/(admin)/catalog-actions";
import { MatchForm } from "@/components/admin/match-form";
import { PageHeader } from "@/components/common/page-header";
import { listCategoryOptions } from "@/lib/admin/categories";
import { requireAdminPage } from "@/lib/admin/guard";
import { listTeamOptions } from "@/lib/admin/teams";
import { listTournamentOptions } from "@/lib/admin/tournaments";

export const metadata: Metadata = { title: "New event" };

export default async function NewMatchPage() {
  await requireAdminPage("matches.manage", { fallback: "/admin/matches" });

  const [categories, tournaments, teams] = await Promise.all([
    listCategoryOptions(),
    listTournamentOptions(),
    listTeamOptions(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="New event"
        description="The blank form — one screen, no guidance. If you'd rather be walked through it, use Set up an event."
        backHref="/admin/matches"
        backLabel="All events"
      />

      <MatchForm
        action={createMatchAction}
        categories={categories}
        tournaments={tournaments}
        teams={teams}
        submitLabel="Create event"
      />
    </div>
  );
}
