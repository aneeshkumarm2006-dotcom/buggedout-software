import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateTournamentAction } from "@/app/(admin)/catalog-actions";
import { FlashToast } from "@/components/admin/flash-toast";
import { TournamentForm } from "@/components/admin/tournament-form";
import { PageHeader } from "@/components/common/page-header";
import { listCategoryOptions } from "@/lib/admin/categories";
import { requireAdminPage } from "@/lib/admin/guard";
import { parseFlash, type SearchParamsRecord } from "@/lib/admin/list-params";
import { getTournament } from "@/lib/admin/tournaments";

export const metadata: Metadata = { title: "Edit tournament" };

export default async function EditTournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireAdminPage("tournaments.manage", { fallback: "/admin/tournaments" });

  const { tournamentId } = await params;
  const [tournament, categories] = await Promise.all([
    getTournament(tournamentId),
    listCategoryOptions(),
  ]);

  if (!tournament) notFound();

  const { flash } = await searchParams;

  return (
    <div className="space-y-5">
      <FlashToast message={parseFlash(flash)} />

      <PageHeader
        title={tournament.title}
        backHref="/admin/tournaments"
        backLabel="Tournaments"
      />

      <TournamentForm
        action={updateTournamentAction.bind(null, tournament.id)}
        categories={categories}
        tournament={tournament}
        submitLabel="Save tournament"
      />
    </div>
  );
}
