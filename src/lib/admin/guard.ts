import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { firstVisibleAdminHref } from "@/components/admin/nav-items";
import { currentActor, type Actor } from "@/lib/authz";
import { connectDB } from "@/lib/db";
import { hasAnyPermission, type Permission } from "@/lib/permissions";
import { canAccessAdminPanel } from "@/lib/roles";
import { User, type IUser } from "@/models";

/**
 * Page-level access control for `/admin` (Phase 6.1).
 *
 * The proxy checks the role off the JWT and the layout checks it again against
 * the database; this is the third gate, and the only one that knows what a
 * *particular screen* needs. Every admin page opens with it.
 *
 * It re-reads the actor rather than trusting the session copy for the same
 * reason `requirePermission` does: permissions revoked five minutes ago are
 * still sitting in an unexpired JWT.
 */
export async function requireAdminPage(
  permissions: Permission | Permission[],
  options: { fallback?: string } = {},
): Promise<Actor> {
  const actor = await currentActor();

  // Not signed in, banned, or not staff at all — the panel doesn't exist for them.
  if (!actor || !canAccessAdminPanel(actor.role)) redirect("/");

  const required = Array.isArray(permissions) ? permissions : [permissions];

  if (!hasAnyPermission(actor.role, actor.permissions, required)) {
    // Land them somewhere they can actually use. `firstVisibleAdminHref` only
    // ever returns a page whose own guard will pass, so this cannot loop; a
    // caller-supplied fallback gets at most one extra hop before reaching it.
    redirect(options.fallback ?? firstVisibleAdminHref(actor.role, actor.permissions) ?? "/");
  }

  return actor;
}

/** Whether an already-loaded actor holds a permission — for conditional UI. */
export function actorCan(actor: Actor, permission: Permission): boolean {
  return hasAnyPermission(actor.role, actor.permissions, [permission]);
}

export type AdminIdentity = Actor & { username: string; email: string };

/**
 * Who is looking at the panel, for the shell's header and nav filtering.
 *
 * One read rather than `currentActor()` plus a name lookup — the layout runs on
 * every admin navigation, and the page guard is already paying for a second.
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  await connectDB();

  const user = await User.findById(session.user.id)
    .select("role permissions status username email")
    .lean<Pick<IUser, "_id" | "role" | "permissions" | "status" | "username" | "email">>();

  if (!user || user.status !== "active") return null;

  return {
    id: user._id.toString(),
    role: user.role,
    permissions: user.permissions,
    username: user.username,
    email: user.email,
  };
}
