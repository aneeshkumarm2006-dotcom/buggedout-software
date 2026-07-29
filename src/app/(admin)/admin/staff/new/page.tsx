import type { Metadata } from "next";

import { createStaffAction } from "@/app/(admin)/people-actions";
import { StaffForm } from "@/components/admin/staff-form";
import { PageHeader } from "@/components/common/page-header";
import { requireAdminPage } from "@/lib/admin/guard";
import { assignableRoles, grantableFor } from "@/lib/admin/users";

export const metadata: Metadata = { title: "Add staff" };

export default async function NewStaffPage() {
  const actor = await requireAdminPage("staff.manage", { fallback: "/admin/staff" });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Add staff"
        description="Grant only what the job needs — every permission below unlocks a screen that can change real balances or real access."
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
