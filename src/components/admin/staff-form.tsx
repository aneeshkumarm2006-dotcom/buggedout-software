"use client";

import { useActionState, useState } from "react";
import { ShieldCheckIcon } from "lucide-react";

import {
  FieldRow,
  FormActions,
  FormAlert,
  FormCard,
  TextField,
  useFormToast,
} from "@/components/admin/form-parts";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StaffDetail } from "@/lib/admin/users";
import { USER_STATUSES } from "@/lib/enums";
import { fieldError, idleFormState, type FormState } from "@/lib/form";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import type { Role } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Staff accounts and the permission matrix (Phase 6.3).
 *
 * `grantable` is the set the *editor* holds, worked out on the server. Anything
 * outside it renders disabled and read-only: you can neither give away access
 * you were never given, nor take away access you don't have. The server merges
 * on the same rule, so a disabled box that doesn't post can't silently revoke
 * what it was showing.
 *
 * A super admin holds everything implicitly, so the matrix is switched off
 * rather than pretending the boxes mean something.
 */
const ROLE_LABELS: Record<Role, string> = {
  user: "User — no admin access",
  staff: "Staff — only what is ticked below",
  admin: "Admin — only what is ticked below",
  superadmin: "Super admin — everything, always",
};

export function StaffForm({
  action,
  staff,
  roles,
  grantable,
  submitLabel,
  isSelf = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  staff?: StaffDetail;
  roles: Role[];
  grantable: string[];
  submitLabel: string;
  isSelf?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idleFormState);
  useFormToast(state);

  const [role, setRole] = useState<string>(staff?.role ?? "staff");
  const [status, setStatus] = useState<string>(staff?.status ?? "active");
  const [permissions, setPermissions] = useState<string[]>(staff?.permissions ?? []);

  const grantableSet = new Set(grantable);
  const implicit = role === "superadmin";

  function toggle(permission: string) {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((value) => value !== permission)
        : [...current, permission],
    );
  }

  return (
    <form action={formAction} className="grid max-w-3xl gap-4" noValidate>
      <FormAlert state={state} />

      {/* Hidden inputs rather than `name` on the selects: a *disabled* Radix
          select posts nothing at all, and a missing enum field reads as an
          empty string server-side, which would fail validation on the one
          screen where the fields are deliberately frozen. */}
      <input type="hidden" name="permissions" value={JSON.stringify(permissions)} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="status" value={status} />

      {isSelf ? (
        <p className="border-border/70 text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-sm">
          This is your own account. Roles and permissions can only be changed by another admin —
          that is what stops anyone quietly promoting themselves.
        </p>
      ) : null}

      <FormCard title="Account">
        <FieldRow>
          <TextField
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="off"
            defaultValue={state.values?.email ?? staff?.email ?? ""}
            error={fieldError(state, "email")}
          />

          <TextField
            label="Username"
            name="username"
            required
            minLength={3}
            maxLength={20}
            autoComplete="off"
            defaultValue={state.values?.username ?? staff?.username ?? ""}
            error={fieldError(state, "username")}
          />
        </FieldRow>

        {staff ? null : (
          <TextField
            label="Password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            error={fieldError(state, "password")}
            hint="At least 8 characters. They can change it from their profile."
          />
        )}

        <FieldRow>
          <div className="grid gap-1.5">
            <Label htmlFor="staff-role">Role</Label>

            <Select value={role} onValueChange={setRole} disabled={isSelf}>
              <SelectTrigger id="staff-role" className="h-11 w-full md:h-10">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {roles.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {fieldError(state, "role") ? (
              <p className="text-destructive text-xs">{fieldError(state, "role")}</p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="staff-status">Status</Label>

            <Select value={status} onValueChange={setStatus} disabled={isSelf}>
              <SelectTrigger id="staff-status" className="h-11 w-full md:h-10">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {USER_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === "active" ? "Active" : "Banned — cannot log in"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {fieldError(state, "status") ? (
              <p className="text-destructive text-xs">{fieldError(state, "status")}</p>
            ) : null}
          </div>
        </FieldRow>
      </FormCard>

      <FormCard
        title="Permissions"
        description={
          implicit
            ? "A super admin holds every permission implicitly — there is nothing to tick."
            : "Each page of the panel checks these server-side, on every request."
        }
      >
        {implicit ? (
          <p className="text-primary flex items-center gap-2 text-sm">
            <ShieldCheckIcon className="size-4" />
            Full access to everything.
          </p>
        ) : (
          <div className="grid gap-5">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.key} className="grid gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{group.title}</h3>
                  <p className="text-muted-foreground text-xs">{group.description}</p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {group.permissions.map((permission) => {
                    const allowed = grantableSet.has(permission.value);
                    const checked = permissions.includes(permission.value);

                    return (
                      <label
                        key={permission.value}
                        className={cn(
                          "flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
                          checked ? "border-primary/50 bg-primary/5" : "border-border",
                          allowed ? "cursor-pointer" : "opacity-60",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!allowed || isSelf}
                          onCheckedChange={() => toggle(permission.value)}
                          className="mt-0.5"
                        />

                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{permission.label}</span>
                          <span className="text-muted-foreground block text-xs">
                            {allowed
                              ? permission.hint
                              : "You don't hold this permission, so you can't change it."}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {fieldError(state, "permissions") ? (
          <p className="text-destructive text-xs">{fieldError(state, "permissions")}</p>
        ) : null}
      </FormCard>

      <FormActions
        pending={pending}
        submitLabel={submitLabel}
        cancelHref="/admin/staff"
      />
    </form>
  );
}
