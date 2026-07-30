import type { Metadata } from "next";

import { createStaffAction } from "@/app/(admin)/people-actions";
import { StaffForm } from "@/components/admin/staff-form";
import { PageHeader } from "@/components/common/page-header";
import { requireAdminPage } from "@/lib/admin/guard";
import { assignableRoles, grantableFor } from "@/lib/admin/users";

export const metadata: Metadata = { title: "Add a colleague" };

export default async function NewStaffPage() {
  const actor = await requireAdminPage("staff.manage", { fallback: "/admin/staff" });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Add a colleague"
        description="Pick the job that matches what they'll actually be doing. You can always give them more later — start with less."
        backHref="/admin/staff"
        backLabel="Staff"
      />

      <StaffForm
        action={createStaffAction}
        roles={assignableRoles(actor)}
        grantable={grantableFor(actor)}
        submitLabel="Create account"
      />
    </div>
  );
}
