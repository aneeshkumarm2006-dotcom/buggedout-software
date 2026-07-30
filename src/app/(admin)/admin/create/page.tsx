import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGridIcon } from "lucide-react";

import { EventWizard } from "@/components/admin/event-wizard";
import { HelpNote } from "@/components/admin/help-note";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { actorCan, requireAdminPage } from "@/lib/admin/guard";
import { getSetupCatalogue } from "@/lib/admin/setup";

export const metadata: Metadata = { title: "Set up an event" };

/**
 * The one screen that puts a whole event live.
 *
 * `/admin/matches/new` still exists and is still the precise tool — a single
 * field to change, an event to move between series. This is the other end of
 * the same job: everything in one pass, in the order a person thinks about it,
 * with competitors creatable in place.
 *
 * Guarded on `matches.manage` because that is the first thing it writes. The
 * action re-checks `questions.manage` before it writes anything at all, so
 * somebody who can only do half the job is told so up front rather than left
 * with an event nobody can bet on.
 */
export default async function SetUpEventPage() {
  const actor = await requireAdminPage("matches.manage", { fallback: "/admin/matches" });

  const catalogue = await getSetupCatalogue();
  const gamesWithCompetitors = new Set(
    catalogue.teams.filter((team) => team.status === "active").map((team) => team.categoryId),
  );

  if (catalogue.games.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Set up an event"
          description="Everything players bet on, built in one go."
        />

        <div className="border-border grid place-items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
          <LayoutGridIcon className="text-muted-foreground size-7" />
          <p className="font-heading text-base font-semibold">There are no games yet.</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            A game is the kind of event — Lane Races, Three Door Monty. Everything else hangs off
            one, so that comes first.
          </p>
          <Button asChild size="lg">
            <Link href="/admin/categories/new">Add the first game</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Set up an event"
        description="Five questions, and players can bet on it. Nothing is saved until the last step."
        action={
          <Button asChild variant="ghost" size="lg">
            <Link href="/admin/matches">All events</Link>
          </Button>
        }
      />

      <HelpNote title="What you're about to build">
        <p>
          An <strong>event</strong> is one thing that happens — a race, a heat, a round. Players bet
          on the <strong>questions</strong> you attach to it, and each question has{" "}
          <strong>answers</strong> with a payout.
        </p>
        <p>
          Once it&apos;s run, you come back and enter the result. That&apos;s what pays everybody
          out.
        </p>
      </HelpNote>

      {gamesWithCompetitors.size === 0 ? (
        <HelpNote title="No competitors exist yet">
          <p>
            That&apos;s fine — you can add them on step 2 without leaving this page. A competitor is
            whatever players pick between: a turtle, a lane, a door.
          </p>
        </HelpNote>
      ) : null}

      <EventWizard catalogue={catalogue} canAddCompetitors={actorCan(actor, "teams.manage")} />
    </div>
  );
}
