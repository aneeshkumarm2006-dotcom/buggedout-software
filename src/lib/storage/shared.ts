import type { Permission } from "@/lib/permissions";

/**
 * The client/server contract for image uploads (Phase 6.6, reworked for
 * Cloudinary).
 *
 * Deliberately free of `server-only` and of any Node import: the browser field
 * reads the same presets the route handler enforces, so "what size do I resize
 * to" and "what am I allowed to send" are answered once, in one place. Anything
 * that needs a secret lives in `cloudinary.ts` instead.
 */

export type UploadPresetId = "team-crest" | "game-card" | "avatar";

export type UploadPreset = {
  id: UploadPresetId;
  /** Sub-folder under `CLOUDINARY_FOLDER`. */
  folder: string;
  /**
   * What the browser resizes to before sending, when a cloud provider is
   * configured. Bigger than `delivery` on purpose — the provider re-crops per
   * delivery URL, so the stored original is worth keeping usable.
   */
  source: { width: number; height: number };
  /** What the stored URL renders at, and the browser resize target when the inline fallback is in play. */
  delivery: { width: number; height: number };
  /** Preview box in the form, in CSS pixels. */
  preview: { width: number; height: number };
  /**
   * Ceiling for the inline (data URL) fallback, in bytes of image data before
   * base64. `0` means this preset is too big to ever live in a document and
   * needs real storage configured.
   */
  maxInlineBytes: number;
  /** Permission required to use it; `null` means any signed-in user (self-service avatars). */
  permission: Permission | null;
};

const KB = 1024;

export const UPLOAD_PRESETS = {
  "team-crest": {
    id: "team-crest",
    folder: "teams",
    source: { width: 256, height: 256 },
    delivery: { width: 64, height: 64 },
    preview: { width: 64, height: 64 },
    maxInlineBytes: 48 * KB,
    permission: "teams.manage",
  },
  "game-card": {
    id: "game-card",
    folder: "games",
    source: { width: 1600, height: 900 },
    delivery: { width: 800, height: 450 },
    preview: { width: 144, height: 81 },
    // A 16:9 card is six figures of base64 in a document that the lobby reads
    // on every visit. Cloud storage or a path under /public — not inline.
    maxInlineBytes: 0,
    permission: "categories.manage",
  },
  avatar: {
    id: "avatar",
    folder: "avatars",
    source: { width: 256, height: 256 },
    delivery: { width: 128, height: 128 },
    preview: { width: 64, height: 64 },
    maxInlineBytes: 48 * KB,
    permission: null,
  },
} as const satisfies Record<UploadPresetId, UploadPreset>;

export function getUploadPreset(id: string): UploadPreset | null {
  return (UPLOAD_PRESETS as Record<string, UploadPreset>)[id] ?? null;
}

/**
 * The delivery transformation a preset bakes into its stored URL. The browser
 * has already cropped to the right aspect ratio, so `c_fill` only scales — no
 * gravity guesswork, and the same URL shape for every preset.
 */
export function presetTransformation(preset: UploadPreset): string {
  return `c_fill,w_${preset.delivery.width},h_${preset.delivery.height},f_auto,q_auto`;
}

/**
 * Format and quality negotiation with no resizing, for artwork whose intrinsic
 * dimensions are the point — the logo, the empty-state icons, the migrated game
 * cards that were authored at the size they are drawn.
 */
export const PASSTHROUGH_TRANSFORMATION = "f_auto,q_auto";

/** Video has no `f_auto` worth having here: the source is already an mp4 the browser plays. */
export const VIDEO_TRANSFORMATION = "q_auto";

/**
 * Site chrome — the logo, the win banner, the empty-state icons. Not managed by
 * anybody through the admin panel, so it gets deterministic public IDs instead
 * of a preset: `site-assets.ts` can then name a URL without a database lookup,
 * and re-running the migration overwrites rather than duplicating.
 */
export const SITE_ASSET_FOLDER = "chrome";

/** Source file the browser will accept before it resizes. */
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/**
 * Ceiling on the *resized* payload the route handler accepts. Under Vercel's
 * 4.5 MB request body limit with room to spare — a resized `source` is a couple
 * of hundred kilobytes, so this only ever catches a caller that skipped the
 * browser-side resize.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Cloud name is not a secret — it is the first path segment of every delivery
 * URL — so the browser is told it, and only it. Its presence is how the upload
 * field knows whether to resize for a CDN (`source`) or for a data URL that has
 * to fit in a Mongo document (`delivery`).
 *
 * `env.ts` refuses to boot if this disagrees with the server-side cloud name,
 * which is the failure mode worth catching: a client that thinks uploads work
 * talking to a server that has no credentials.
 */
export const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

/**
 * The root folder, also readable in the browser, because `site-assets.ts` names
 * chrome URLs directly rather than reading them out of a document. Defaults to
 * the same `buggedout` the server does, so it only needs setting if that was
 * changed — and `env.ts` refuses to boot if the two disagree.
 */
export const CLOUDINARY_FOLDER = process.env.NEXT_PUBLIC_CLOUDINARY_FOLDER || "buggedout";

export const cloudStorageEnabled = CLOUDINARY_CLOUD_NAME.length > 0;

export const UPLOAD_ENDPOINT = "/api/uploads";

/** What `POST /api/uploads` answers with. */
export type UploadResponse =
  | { ok: true; url: string; provider: string; bytes: number }
  | { ok: false; error: string };
