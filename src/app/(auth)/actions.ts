"use server";

import { redirect } from "next/navigation";
import { CredentialsSignin, AuthError } from "next-auth";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { connectDB } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { sendPasswordResetEmail } from "@/lib/mailer";
import { hashPassword } from "@/lib/password";
import {
  clearPasswordResetTokens,
  createPasswordResetToken,
  consumePasswordResetToken,
} from "@/lib/password-reset";
import {
  AUTH_RATE_LIMITS,
  clearRateLimit,
  clientRateLimitKey,
  formatRetryAfter,
  rateLimit,
} from "@/lib/rate-limit";
import { creditReferralSignupRewards } from "@/lib/referral";
import { canAccessAdminPanel } from "@/lib/roles";
import { getBaseUrl } from "@/lib/url";
import { creditSignupBonus } from "@/lib/wallet";
import { User, type IUser } from "@/models";
import type { Types } from "mongoose";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/schemas";

/**
 * Auth server actions (Phase 3.1–3.3).
 *
 * Each one is reachable by a direct POST, so validation, rate limiting and the
 * duplicate checks all live here rather than in the forms — the client-side
 * `required`/`minLength` attributes are a convenience, not a control.
 */

const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Signup logs the new account straight in, so the session is a remembered one. */
const SIGNUP_REMEMBER_ME = true;

export async function signupAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  // Echoed back on every failure so a rejected submit doesn't wipe the form.
  const values = pickValues(formData, ["email", "username", "referralCode"]);

  const parsed = signupSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { status: "error", values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const { email, username, password, referralCode } = parsed.data;

  const limit = rateLimit(await clientRateLimitKey("signup"), AUTH_RATE_LIMITS.signup);
  if (!limit.ok) {
    return {
      status: "error",
      values,
      message: `Too many accounts created from this device. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.`,
    };
  }

  try {
    await connectDB();

    const clash = await User.findOne({ $or: [{ email }, { username }] })
      .select("email username")
      .lean<Pick<IUser, "email" | "username">>();

    if (clash) {
      return {
        status: "error",
        values,
        fieldErrors:
          clash.email === email
            ? { email: ["That email is already registered"] }
            : { username: ["That username is taken"] },
      };
    }

    let referrer: Pick<IUser, "_id"> | null = null;
    if (referralCode) {
      referrer = await User.findOne({ referralCode, status: "active" })
        .select("_id")
        .lean<Pick<IUser, "_id">>();

      if (!referrer) {
        return {
          status: "error",
          values,
          fieldErrors: { referralCode: ["We don't recognise that code"] },
        };
      }
    }

    const passwordHash = await hashPassword(password);

    // `referralCode` defaults to a random string with a unique index behind it;
    // on the rare collision the insert is simply retried with a fresh one.
    let created: { _id: Types.ObjectId } | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      try {
        created = await User.create({
          email,
          username,
          passwordHash,
          referredBy: referrer?._id ?? null,
        });
      } catch (error) {
        const duplicatedField = duplicateKeyField(error);
        if (duplicatedField === "referralCode") continue;
        if (duplicatedField === "email") {
          return {
            status: "error",
            values,
            fieldErrors: { email: ["That email is already registered"] },
          };
        }
        if (duplicatedField === "username") {
          return {
            status: "error",
            values,
            fieldErrors: { username: ["That username is taken"] },
          };
        }
        throw error;
      }
    }

    if (!created) return { status: "error", values, message: GENERIC_ERROR };

    // Balance changes only ever go through the wallet service, so the welcome
    // coins arrive as a ledger entry rather than a field on the insert above.
    try {
      await creditSignupBonus(created._id);
    } catch (error) {
      // The account is real and usable; an admin can credit the bonus by hand.
      console.error("[signup] failed to credit the signup bonus", error);
    }

    // Referral rewards, both sides, per the ReferralSetting singleton (4.7).
    // Swallows its own failures — a bonus that didn't land is an admin credit
    // away, an account that didn't get created is not.
    if (referrer) {
      await creditReferralSignupRewards({
        referredUserId: created._id,
        referrerId: referrer._id,
      });
    }

    clearRateLimit(await clientRateLimitKey("signup"));
  } catch (error) {
    console.error("[signup] failed", error);
    return { status: "error", values, message: GENERIC_ERROR };
  }

  // Auto-login. If only this part fails the account still exists, so send them
  // to the login form rather than reporting the whole signup as failed.
  try {
    await signIn("credentials", {
      identifier: email,
      password,
      rememberMe: SIGNUP_REMEMBER_ME,
      redirect: false,
    });
  } catch (error) {
    console.error("[signup] auto-login failed", error);
    redirect("/login?created=1");
  }

  // Outside the try blocks: `redirect` works by throwing, and being caught
  // would turn a successful signup into an error banner.
  redirect("/");
}

export async function loginAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const values = pickValues(formData, ["identifier"]);
  // An unticked checkbox posts nothing at all, so the two states are recorded
  // explicitly — the form keys the checkbox on this to restore it.
  values.rememberMe = formData.get("rememberMe") ? "on" : "off";

  const parsed = loginSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { status: "error", values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const { identifier, password, rememberMe } = parsed.data;

  // Bucketed per identifier as well as per IP, so hammering one account can't
  // lock every user behind the same office NAT out of logging in.
  const limitKey = await clientRateLimitKey("login", identifier.toLowerCase());
  const limit = rateLimit(limitKey, AUTH_RATE_LIMITS.login);
  if (!limit.ok) {
    return {
      status: "error",
      values,
      message: `Too many attempts. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.`,
    };
  }

  try {
    await signIn("credentials", { identifier, password, rememberMe, redirect: false });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      return { status: "error", values, message: signInErrorMessage(error.code) };
    }

    if (error instanceof AuthError) {
      console.error("[login] auth error", error);
      return { status: "error", values, message: GENERIC_ERROR };
    }

    console.error("[login] failed", error);
    return { status: "error", values, message: GENERIC_ERROR };
  }

  clearRateLimit(limitKey);

  redirect(await postLoginDestination(identifier, formData.get("callbackUrl")));
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

/**
 * Always reports success, whether or not the address belongs to an account —
 * the response is the one place a stranger could otherwise learn who is
 * registered here.
 */
export async function requestPasswordResetAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = pickValues(formData, ["email"]);

  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { status: "error", values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const { email } = parsed.data;

  const limit = rateLimit(
    await clientRateLimitKey("forgot", email),
    AUTH_RATE_LIMITS.forgotPassword,
  );
  if (!limit.ok) {
    return {
      status: "error",
      values,
      message: `Too many reset requests. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.`,
    };
  }

  const sent: FormState = {
    status: "success",
    message: "If that email has an account, a reset link is on its way.",
  };

  try {
    await connectDB();

    const user = await User.findOne({ email, status: "active" })
      .select("_id email username")
      .lean<Pick<IUser, "_id" | "email" | "username">>();

    if (!user) return sent;

    const { token, expiresAt } = await createPasswordResetToken(user._id);
    const baseUrl = await getBaseUrl();

    await sendPasswordResetEmail({
      to: user.email,
      username: user.username,
      resetUrl: `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`,
      expiresAt,
    });

    return sent;
  } catch (error) {
    console.error("[forgot-password] failed", error);
    return { status: "error", values, message: GENERIC_ERROR };
  }
}

export async function resetPasswordAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { status: "error", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const { token, password } = parsed.data;

  const limit = rateLimit(await clientRateLimitKey("reset"), AUTH_RATE_LIMITS.resetPassword);
  if (!limit.ok) {
    return {
      status: "error",
      message: `Too many attempts. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.`,
    };
  }

  try {
    // Consuming the token marks it used in the same operation that reads it, so
    // a double submit can't set the password twice.
    const userId = await consumePasswordResetToken(token);

    if (!userId) {
      return {
        status: "error",
        message: "This reset link has expired or has already been used. Request a new one.",
      };
    }

    const passwordHash = await hashPassword(password);
    const updated = await User.updateOne({ _id: userId }, { $set: { passwordHash } });

    if (updated.matchedCount === 0) {
      return { status: "error", message: GENERIC_ERROR };
    }

    // Any other outstanding link for this account is now void.
    await clearPasswordResetTokens(userId);
  } catch (error) {
    console.error("[reset-password] failed", error);
    return { status: "error", message: GENERIC_ERROR };
  }

  redirect("/login?reset=1");
}

/**
 * Copies the named fields back out of the submission. Passwords are never
 * included — only the fields a user would resent being made to retype.
 */
function pickValues(formData: FormData, fields: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};

  for (const field of fields) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value;
  }

  return values;
}

/** Auth.js surfaces `authorize()` failures as a code; this is the user-facing half. */
function signInErrorMessage(code: string | undefined): string {
  switch (code) {
    case "account_banned":
      return "This account has been suspended. Contact support if you think that's a mistake.";
    case "invalid_credentials":
    default:
      return "Wrong email/username or password.";
  }
}

/** Reads the duplicated index out of a Mongo E11000, e.g. `email_1` → `email`. */
function duplicateKeyField(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const { code, keyPattern } = error as { code?: unknown; keyPattern?: Record<string, unknown> };
  if (code !== 11000) return null;
  return keyPattern ? (Object.keys(keyPattern)[0] ?? null) : null;
}

/**
 * `?callbackUrl=` comes straight off the URL bar, so only same-site paths are
 * honoured — `//evil.com` and `https://evil.com` both fall back to the lobby.
 */
function safeCallbackUrl(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/**
 * Where a fresh session lands.
 *
 * An explicit `callbackUrl` always wins: the proxy only sets one when it has
 * just bounced someone off the page they actually asked for, and sending them
 * somewhere else instead would lose it. With no such hint, staff open on the
 * admin panel and everyone else on the lobby — nothing in the player UI links
 * to `/admin`, so an operator would otherwise have to type the URL every time.
 *
 * The role is re-read rather than taken from `auth()`: the session cookie
 * `signIn` just wrote is on the *response*, and is not readable until the
 * request after this one.
 */
async function postLoginDestination(
  identifier: string,
  callbackUrl: FormDataEntryValue | null,
): Promise<string> {
  const requested = safeCallbackUrl(callbackUrl);
  if (requested !== "/") return requested;

  try {
    await connectDB();

    // The same either/or `authorize()` uses — a username cannot contain "@".
    const query = identifier.includes("@")
      ? { email: identifier.toLowerCase() }
      : { username: identifier };

    const user = await User.findOne(query).select("role").lean<Pick<IUser, "role">>();

    return canAccessAdminPanel(user?.role) ? "/admin" : "/";
  } catch (error) {
    // A signed-in user landing on the lobby is a far better failure than a
    // signed-in user seeing an error page.
    console.error("[login] could not resolve landing page", error);
    return "/";
  }
}
