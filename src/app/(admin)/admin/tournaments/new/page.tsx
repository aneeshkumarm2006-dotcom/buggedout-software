import type { Metadata } from "next";

import { createTournamentAction } from "@/app/(admin)/catalog-actions";
import { TournamentForm } from "@/components/admin/tournament-form";
import { PageHeader } from "@/components/common/page-header";
import { listCategoryOptions } from "@/lib/admin/categories";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata: Metadata = { title: "New series" };

export default async function NewTournamentPage() {
  await requireAdminPage("tournaments.manage", { fallback: "/admin/tournaments" });

  const categories = await listCategoryOptions();

  return (
    <div className="space-y-5">
      <PageHeader
        title="New series"
        description="A named run of events for one game, over a date range. Entirely optional — an event can stand on its own."
        backHref="/admin/tournaments"
        backLabel="Tournaments"
      />

      <TournamentForm
        action={createTournamentAction}
        categories={categories}
        submitLabel="Create tournament"
      />
    </div>
  );
}
