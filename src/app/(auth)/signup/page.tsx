import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/app/(auth)/signup/signup-form";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  return (
    <div className="grid gap-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="text-muted-foreground text-sm">
          Free virtual coins. No deposits, ever.
        </p>
      </div>

      <SignupForm
        signupBonus={env.SIGNUP_BONUS_COINS}
        referralCode={ref?.trim().toUpperCase() || undefined}
      />

      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
