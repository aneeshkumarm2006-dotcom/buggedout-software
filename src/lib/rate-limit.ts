import "server-only";

import { headers } from "next/headers";

/**
 * Fixed-window rate limiter for the auth endpoints (Phase 3.3).
 *
 * Deliberately in-process: it needs no infrastructure and stops the credential
 * stuffing / password-reset spam an unauthenticated form invites. The trade-off
 * is that each serverless instance keeps its own counters, so the effective
 * limit is `limit × instances` — good enough as a first line, and the place to
 * swap in Redis/Upstash if the deploy ever needs a hard guarantee.
 *
 * State lives on `globalThis` so it survives the module re-evaluation that
 * happens on every HMR reload and every warm serverless invocation.
 */
type Bucket = {
  count: number;
  /** Epoch ms at which the window rolls over. */
  resetAt: number;
};

const globalForRateLimit = globalThis as typeof globalThis & {
  __rateLimitBuckets?: Map<string, Bucket>;
};

const buckets: Map<string, Bucket> = (globalForRateLimit.__rateLimitBuckets ??= new Map());

/** Sweep expired buckets once the map grows past this, so it can't leak forever. */
const SWEEP_THRESHOLD = 5_000;

export type RateLimitRule = {
  /** Attempts allowed per window. */
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** Seconds until the window rolls over — surfaced in the "try again in…" message. */
  retryAfterSeconds: number;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** One rule per auth surface. Login is per IP + identifier so one attacker can't lock out a victim globally. */
export const AUTH_RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * MINUTE },
  signup: { limit: 5, windowMs: HOUR },
  forgotPassword: { limit: 5, windowMs: HOUR },
  resetPassword: { limit: 10, windowMs: HOUR },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Bet placement (Phase 4.1). Bucketed per user, not per IP — the caller is
 * signed in, and a shared connection shouldn't make one user's tapping throttle
 * everyone else's. Loose enough for a fast finger on a live market, tight
 * enough that a script can't hammer the wallet.
 */
export const BETTING_RATE_LIMITS = {
  placeBets: { limit: 30, windowMs: MINUTE },
} as const satisfies Record<string, RateLimitRule>;

export function rateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();

  if (buckets.size > SWEEP_THRESHOLD) sweep(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { ok: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > rule.limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { ok: true, remaining: rule.limit - bucket.count, retryAfterSeconds: 0 };
}

/**
 * Drops a key's counter. Called after a *successful* login/signup so a user who
 * mistyped their password a few times isn't still carrying those strikes.
 */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Best-effort client IP. Behind Vercel/any proxy `x-forwarded-for` is a
 * comma-separated chain whose first entry is the client; the fallback keeps
 * local dev (where no proxy header exists) from bucketing everyone together
 * under the same empty string.
 */
export async function getClientIp(): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return headerList.get("x-real-ip") ?? "127.0.0.1";
}

/** `login:203.0.113.4:ada@example.com` — scope + IP + whatever else makes the bucket specific. */
export async function clientRateLimitKey(scope: string, ...parts: string[]): Promise<string> {
  const ip = await getClientIp();
  return [scope, ip, ...parts].join(":");
}

/** Human-readable cooldown for the form error message. */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
