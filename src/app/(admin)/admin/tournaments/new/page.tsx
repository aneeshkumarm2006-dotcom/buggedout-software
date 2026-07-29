import type { Metadata } from "next";

import { createTournamentAction } from "@/app/(admin)/catalog-actions";
import { TournamentForm } from "@/components/admin/tournament-form";
import { PageHeader } from "@/components/common/page-header";
import { listCategoryOptions } from "@/lib/admin/categories";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata: Metadata = { title: "New tournament" };

export default async function NewTournamentPage() {
  await requireAdminPage("tournaments.manage", { fallback: "/admin/tournaments" });

  const categories = await listCategoryOptions();

  return (
    <div className="space-y-5">
      <PageHeader
        title="New tournament"
        description="A named run of matches for one game."
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
