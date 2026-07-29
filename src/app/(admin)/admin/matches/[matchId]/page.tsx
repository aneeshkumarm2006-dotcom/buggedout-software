import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListChecksIcon } from "lucide-react";

import { updateMatchAction } from "@/app/(admin)/catalog-actions";
import { FlashToast } from "@/components/admin/flash-toast";
import { MatchForm } from "@/components/admin/match-form";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { listCategoryOptions } from "@/lib/admin/categories";
import { requireAdminPage } from "@/lib/admin/guard";
import { parseFlash, type SearchParamsRecord } from "@/lib/admin/list-params";
import { getMatch } from "@/lib/admin/matches";
import { listTeamOptions } from "@/lib/admin/teams";
import { listTournamentOptions } from "@/lib/admin/tournaments";

export const metadata: Metadata = { title: "Edit match" };

export default async function EditMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireAdminPage("matches.manage", { fallback: "/admin/matches" });

  const { matchId } = await params;
  const [match, categories, tournaments, teams] = await Promise.all([
    getMatch(matchId),
    listCategoryOptions(),
    listTournamentOptions(),
    listTeamOptions(),
  ]);

  if (!match) notFound();

  const { flash } = await searchParams;

  return (
    <div className="space-y-5">
      <FlashToast message={parseFlash(flash)} />

      <PageHeader
        title={match.title}
        backHref="/admin/matches"
        backLabel="Matches"
        action={
          <Button asChild variant="outline" size="lg">
            <Link href={`/admin/matches/${match.id}/questions`}>
              <ListChecksIcon />
              Questions
            </Link>
          </Button>
        }
      />

      <MatchForm
        action={updateMatchAction.bind(null, match.id)}
        categories={categories}
        tournaments={tournaments}
        teams={teams}
        match={match}
        submitLabel="Save match"
      />
    </div>
  );
}
