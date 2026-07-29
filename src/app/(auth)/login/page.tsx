import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; reset?: string; created?: string }>;
}) {
  const { callbackUrl, reset, created } = await searchParams;

  // Only same-site paths survive; the action re-checks before redirecting.
  const safeCallbackUrl =
    callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : undefined;

  const notice = reset
    ? "Password updated. Log in with your new one."
    : created
      ? "Account created. Log in to start playing."
      : null;

  return (
    <div className="grid gap-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground text-sm">Log in to place your bets.</p>
      </div>

      {notice ? (
        <Alert className="text-primary">
          <AlertDescription className="text-primary/90">{notice}</AlertDescription>
        </Alert>
      ) : null}

      <LoginForm callbackUrl={safeCallbackUrl} />

      <p className="text-muted-foreground text-center text-sm">
        New here?{" "}
        <Link href="/signup" className="text-primary font-medium hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
