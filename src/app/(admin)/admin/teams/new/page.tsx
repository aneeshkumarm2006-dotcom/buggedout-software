import type { Metadata } from "next";

import { createTeamAction } from "@/app/(admin)/catalog-actions";
import { TeamForm } from "@/components/admin/team-form";
import { PageHeader } from "@/components/common/page-header";
import { listCategoryOptions } from "@/lib/admin/categories";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata: Metadata = { title: "New competitor" };

export default async function NewTeamPage() {
  await requireAdminPage("teams.manage", { fallback: "/admin/teams" });

  const categories = await listCategoryOptions();

  return (
    <div className="space-y-5">
      <PageHeader
        title="New competitor"
        description="Something players will pick between — a turtle, a lane, a door. Pick which game it belongs to and give it a picture."
        backHref="/admin/teams"
        backLabel="Teams"
      />

      <TeamForm action={createTeamAction} categories={categories} submitLabel="Create team" />
    </div>
  );
}
