import type { Metadata } from "next";

import { createMatchAction } from "@/app/(admin)/catalog-actions";
import { MatchForm } from "@/components/admin/match-form";
import { PageHeader } from "@/components/common/page-header";
import { listCategoryOptions } from "@/lib/admin/categories";
import { requireAdminPage } from "@/lib/admin/guard";
import { listTeamOptions } from "@/lib/admin/teams";
import { listTournamentOptions } from "@/lib/admin/tournaments";

export const metadata: Metadata = { title: "New match" };

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
        title="New match"
        description="Pick a game, then the teams and the start time. Markets come next."
        backHref="/admin/matches"
        backLabel="Matches"
      />

      <MatchForm
        action={createMatchAction}
        categories={categories}
        tournaments={tournaments}
        teams={teams}
        submitLabel="Create match"
      />
    </div>
  );
}
