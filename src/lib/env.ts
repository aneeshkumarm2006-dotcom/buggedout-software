import "server-only";

import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  SIGNUP_BONUS_COINS: z.coerce.number().int().nonnegative().default(1000),
  DAILY_BONUS_COINS: z.coerce.number().int().nonnegative().default(100),
  /**
   * Shared secret for `/api/cron/*` (Phase 4.3). Optional so local dev needs no
   * setup — the route refuses to run unauthenticated in production instead.
   */
  CRON_SECRET: z.preprocess(
    // `CRON_SECRET=` with nothing after it means "not set", not "empty secret".
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment variables:\n${issues}\n\nCopy .env.example to .env.local and fill it in.`);
}

export const env = parsed.data;
