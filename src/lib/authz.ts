import "server-only";

import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import { hasPermission, type Permission } from "@/lib/permissions";
import { canAccessAdminPanel, type Role } from "@/lib/roles";
import { User, type IUser } from "@/models";

/**
 * Server-side authorization for admin mutations (Phase 4.3–4.5; Phase 6.1
 * reuses it for every other admin route).
 *
 * The session JWT carries a *copy* of role and permissions that only refreshes
 * when the token is re-issued, so a permission revoked five minutes ago would
 * still be sitting in it. Anything that changes data therefore re-reads the
 * user — the JWT copy is fine for hiding UI, not for granting access.
 */
export type Actor = {
  id: string;
  role: Role;
  permissions: string[];
};

export async function currentActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  await connectDB();

  const user = await User.findById(session.user.id)
    .select("role permissions status")
    .lean<Pick<IUser, "_id" | "role" | "permissions" | "status">>();

  if (!user || user.status !== "active") return null;

  return { id: user._id.toString(), role: user.role, permissions: user.permissions };
}

/**
 * Resolves to the actor when they may perform `permission`, and `null` when
 * they may not — callers turn that into their own "not allowed" response rather
 * than catching an exception.
 */
export async function requirePermission(permission: Permission): Promise<Actor | null> {
  const actor = await currentActor();
  if (!actor) return null;
  if (!canAccessAdminPanel(actor.role)) return null;
  if (!hasPermission(actor.role, actor.permissions, permission)) return null;

  return actor;
}
