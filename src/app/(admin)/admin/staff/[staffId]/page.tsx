import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserRoundIcon } from "lucide-react";

import { updateStaffAction } from "@/app/(admin)/people-actions";
import { FlashToast } from "@/components/admin/flash-toast";
import { StaffForm } from "@/components/admin/staff-form";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/admin/guard";
import { parseFlash, type SearchParamsRecord } from "@/lib/admin/list-params";
import { assignableRoles, getStaffMember, grantableFor } from "@/lib/admin/users";

export const metadata: Metadata = { title: "Edit staff" };

export default async function EditStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const actor = await requireAdminPage("staff.manage", { fallback: "/admin/staff" });

  const { staffId } = await params;
  const staff = await getStaffMember(staffId);

  if (!staff) notFound();

  const { flash } = await searchParams;

  return (
    <div className="space-y-5">
      <FlashToast message={parseFlash(flash)} />

      <PageHeader
        title={staff.username}
        description={staff.email}
        backHref="/admin/staff"
        backLabel="Staff"
        action={
          <Button asChild variant="outline" size="lg">
            <Link href={`/admin/users/${staff.id}`}>
              <UserRoundIcon />
              Account detail
            </Link>
          </Button>
        }
      />

      <StaffForm
        action={updateStaffAction.bind(null, staff.id)}
        staff={staff}
        roles={assignableRoles(actor)}
        grantable={grantableFor(actor)}
        submitLabel="Save account"
        isSelf={staff.id === actor.id}
      />
    </div>
  );
}
