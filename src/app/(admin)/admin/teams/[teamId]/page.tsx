import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateTeamAction } from "@/app/(admin)/catalog-actions";
import { FlashToast } from "@/components/admin/flash-toast";
import { TeamForm } from "@/components/admin/team-form";
import { PageHeader } from "@/components/common/page-header";
import { listCategoryOptions } from "@/lib/admin/categories";
import { requireAdminPage } from "@/lib/admin/guard";
import { parseFlash, type SearchParamsRecord } from "@/lib/admin/list-params";
import { getTeam } from "@/lib/admin/teams";

export const metadata: Metadata = { title: "Edit team" };

export default async function EditTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireAdminPage("teams.manage", { fallback: "/admin/teams" });

  const { teamId } = await params;
  const [team, categories] = await Promise.all([getTeam(teamId), listCategoryOptions()]);

  if (!team) notFound();

  const { flash } = await searchParams;

  return (
    <div className="space-y-5">
      <FlashToast message={parseFlash(flash)} />

      <PageHeader title={team.name} backHref="/admin/teams" backLabel="Teams" />

      <TeamForm
        action={updateTeamAction.bind(null, team.id)}
        categories={categories}
        team={team}
        submitLabel="Save team"
      />
    </div>
  );
}
