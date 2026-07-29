import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { visibleAdminNav } from "@/components/admin/nav-items";
import { getAdminIdentity } from "@/lib/admin/guard";
import { canAccessAdminPanel } from "@/lib/roles";

/**
 * The admin frame and its outermost gate (Phase 6.1).
 *
 * The proxy already turns non-staff away on the JWT's copy of the role, but
 * that copy only refreshes when the token is re-issued — so access is re-read
 * from the database here, and again per page in `requireAdminPage()`. A
 * demotion or a ban therefore takes effect on the next navigation rather than
 * in twelve hours.
 *
 * The nav is filtered here too, server-side: what a staff member sees in the
 * sidebar is decided by their real permissions, not by anything the browser
 * sends back.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const identity = await getAdminIdentity();

  if (!identity) redirect("/login");
  if (!canAccessAdminPanel(identity.role)) redirect("/");

  const visibleNav = visibleAdminNav(identity.role, identity.permissions).flatMap((section) =>
    section.items.map((item) => item.href),
  );

  return (
    <AdminShell username={identity.username} role={identity.role} visibleNav={visibleNav}>
      {children}
    </AdminShell>
  );
}
