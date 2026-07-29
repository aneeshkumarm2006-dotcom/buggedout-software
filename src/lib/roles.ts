export const ROLES = ["user", "staff", "admin", "superadmin"] as const;

export type Role = (typeof ROLES)[number];

/** Roles allowed anywhere under `/admin`. Per-page access is permission-gated on top of this. */
export const ADMIN_PANEL_ROLES: readonly Role[] = ["staff", "admin", "superadmin"];

export function canAccessAdminPanel(role: Role | undefined | null): boolean {
  return !!role && ADMIN_PANEL_ROLES.includes(role);
}
