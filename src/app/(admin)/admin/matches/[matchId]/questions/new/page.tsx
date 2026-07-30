import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createQuestionAction } from "@/app/(admin)/catalog-actions";
import { QuestionForm } from "@/components/admin/question-form";
import { PageHeader } from "@/components/common/page-header";
import { requireAdminPage } from "@/lib/admin/guard";
import { getMatchHeader } from "@/lib/admin/matches";
import { getMatchTemplates } from "@/lib/admin/questions";

export const metadata: Metadata = { title: "New question" };

export default async function NewQuestionPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  await requireAdminPage("questions.manage", {
    fallback: `/admin/matches/${matchId}/questions`,
  });

  const [match, templates] = await Promise.all([
    getMatchHeader(matchId),
    getMatchTemplates(matchId),
  ]);

  if (!match) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        title="New betting question"
        description={match.title}
        backHref={`/admin/matches/${matchId}/questions`}
        backLabel="Betting questions"
      />

      <QuestionForm
        action={createQuestionAction.bind(null, matchId)}
        templates={templates}
        matchId={matchId}
        submitLabel="Create question"
      />
    </div>
  );
}
