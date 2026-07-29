import Link from "next/link";
import { CircleHelpIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Catches `notFound()` from the game, match and ticket pages (5.12), so a stale
 * link lands inside the app — nav, balance and bet slip intact — instead of on
 * the framework's bare 404.
 */
export default function UserNotFound() {
  return (
    <div className="mx-auto w-full max-w-md py-10">
      <EmptyState
        icon={CircleHelpIcon}
        title="We couldn't find that"
        description="It may have been cancelled, removed, or the link might be out of date."
        action={
          <Button asChild>
            <Link href="/">Back to the lobby</Link>
          </Button>
        }
      />
    </div>
  );
}
