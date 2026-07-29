import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/app/(auth)/reset-password/reset-password-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isPasswordResetTokenValid } from "@/lib/password-reset";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Checked up front so a dead link says so immediately instead of after the
  // user has typed a password twice. The action re-checks when it consumes it.
  const isValid = token ? await isPasswordResetTokenValid(token) : false;

  return (
    <div className="grid gap-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
        {isValid ? (
          <p className="text-muted-foreground text-sm">
            Choose something you haven&apos;t used here before.
          </p>
        ) : null}
      </div>

      {isValid ? (
        <ResetPasswordForm token={token!} />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>
            This reset link is invalid, has expired, or has already been used. Request a
            fresh one and it&apos;ll work.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-muted-foreground text-center text-sm">
        {isValid ? (
          <>
            Changed your mind?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">
              Back to log in
            </Link>
          </>
        ) : (
          <Link href="/forgot-password" className="text-primary font-medium hover:underline">
            Request a new reset link
          </Link>
        )}
      </p>
    </div>
  );
}
