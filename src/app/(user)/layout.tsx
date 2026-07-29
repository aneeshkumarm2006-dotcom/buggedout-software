import { redirect } from "next/navigation";

import { UserShell } from "@/components/user/user-shell";
import { auth } from "@/auth";
import { getAccountSummary } from "@/lib/account";

/**
 * Frame for every signed-in page (Phase 5.1).
 *
 * The proxy already turns guests away, but the session is re-read here too: a
 * matcher change must not be the only thing standing between a stranger and the
 * lobby. An account that vanished mid-session is sent back the same way.
 */
export default async function UserLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const account = await getAccountSummary(session.user.id);
  if (!account) redirect("/login");

  return <UserShell account={account}>{children}</UserShell>;
}
