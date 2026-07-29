import Link from "next/link";
import { SearchXIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Catches `notFound()` from any admin page, so a stale link or a deleted record
 * lands inside the panel rather than on the site-wide 404 with no way back.
 */
export default function AdminNotFound() {
  return (
    <EmptyState
      icon={SearchXIcon}
      title="Not found"
      description="That record has been deleted, or the link was never right."
      action={
        <Button asChild variant="outline" size="lg">
          <Link href="/admin">Back to the dashboard</Link>
        </Button>
      }
      className="mt-10"
    />
  );
}
