import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateQuestionAction } from "@/app/(admin)/catalog-actions";
import { QuestionForm } from "@/components/admin/question-form";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { requireAdminPage } from "@/lib/admin/guard";
import { getMatchHeader } from "@/lib/admin/matches";
import { getMatchTemplates, getQuestion } from "@/lib/admin/questions";

export const metadata: Metadata = { title: "Edit question" };

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ matchId: string; questionId: string }>;
}) {
  const { matchId, questionId } = await params;

  await requireAdminPage("questions.manage", {
    fallback: `/admin/matches/${matchId}/questions`,
  });

  const [match, question, templates] = await Promise.all([
    getMatchHeader(matchId),
    getQuestion(questionId),
    getMatchTemplates(matchId),
  ]);

  if (!match || !question || question.matchId !== match.id) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Edit betting question"
        description={match.title}
        backHref={`/admin/matches/${matchId}/questions`}
        backLabel="Betting questions"
      />

      {question.locked ? (
        // A settled market is history: its options are what the bets on it were
        // priced against, and editing them would rewrite what people were paid.
        <EmptyState
          title={question.status === "resolved" ? "Already resolved" : "Already voided"}
          description={
            question.status === "resolved"
              ? "The result is in and everyone has been paid, so this question can't be changed."
              : "This question was cancelled and everyone refunded, so it can't be changed."
          }
        />
      ) : (
        <QuestionForm
          action={updateQuestionAction.bind(null, question.id, matchId)}
          question={question}
          templates={templates}
          matchId={matchId}
          submitLabel="Save question"
        />
      )}
    </div>
  );
}
