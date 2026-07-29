import "server-only";

import { z } from "zod";

/** `FOO=` with nothing after it means "not set", not "empty string". */
const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  SIGNUP_BONUS_COINS: z.coerce.number().int().nonnegative().default(1000),
  DAILY_BONUS_COINS: z.coerce.number().int().nonnegative().default(100),
  /**
   * Shared secret for `/api/cron/*` (Phase 4.3). Optional so local dev needs no
   * setup — the route refuses to run unauthenticated in production instead.
   */
  CRON_SECRET: optionalSecret,
  /**
   * Cloudinary (image storage). All optional: with none of them set the app
   * falls back to storing small images inline as data URLs, which is what it
   * did before — see `lib/storage/`.
   */
  CLOUDINARY_CLOUD_NAME: optionalSecret,
  CLOUDINARY_API_KEY: optionalSecret,
  CLOUDINARY_API_SECRET: optionalSecret,
  /** Root folder every upload nests under, so one account can host several apps. */
  CLOUDINARY_FOLDER: z.string().trim().min(1).default("buggedout"),
  /**
   * The cloud name again, readable in the browser. Not a secret — it is the
   * first path segment of every delivery URL — and the upload field needs it to
   * know whether it is resizing for a CDN or for a data URL.
   */
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: optionalSecret,
  /** Ditto the folder — `lib/site-assets.ts` names chrome URLs in the browser. */
  NEXT_PUBLIC_CLOUDINARY_FOLDER: optionalSecret,
})
  .superRefine((value, ctx) => {
    // Half-configured is the worst state to be in: uploads would reach
    // Cloudinary and be refused, or silently fall back to inline for a preset
    // that cannot use it. Fail at boot instead.
    const parts = {
      CLOUDINARY_CLOUD_NAME: value.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: value.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: value.CLOUDINARY_API_SECRET,
    };

    const missing = Object.entries(parts)
      .filter(([, part]) => !part)
      .map(([key]) => key);

    if (missing.length > 0 && missing.length < 3) {
      ctx.addIssue({
        code: "custom",
        path: [missing[0]!],
        message: `Cloudinary is half-configured — also set ${missing.join(", ")} (or clear all three to store images inline)`,
      });
    }

    const publicName = value.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

    if (publicName && publicName !== value.CLOUDINARY_CLOUD_NAME) {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"],
        message:
          "must match CLOUDINARY_CLOUD_NAME — the browser would size uploads for a cloud the server cannot write to",
      });
    }

    const publicFolder = value.NEXT_PUBLIC_CLOUDINARY_FOLDER;

    if (publicFolder && publicFolder !== value.CLOUDINARY_FOLDER) {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_CLOUDINARY_FOLDER"],
        message:
          "must match CLOUDINARY_FOLDER — the browser would build site-asset URLs pointing at a folder nothing was uploaded to",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment variables:\n${issues}\n\nCopy .env.example to .env.local and fill it in.`);
}

export const env = parsed.data;
