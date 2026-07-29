import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_FOLDER,
  PASSTHROUGH_TRANSFORMATION,
  SITE_ASSET_FOLDER,
  cloudStorageEnabled,
} from "@/lib/storage/shared";

/**
 * Site chrome — the logo, the win banner, the empty-state icons. Artwork that
 * ships with the app rather than being managed through the admin panel.
 *
 * These used to be `/logo.webp` string literals scattered through six
 * components. They are named here instead so that *where* they are served from
 * is one decision in one place: with Cloudinary configured they resolve to a
 * CDN URL, and without it they fall straight back to the same `public/` file
 * they always were. Nothing downstream can tell the difference, and a change of
 * account is a change of environment variable, not a change of source.
 *
 * The public IDs are deterministic — `buggedout/chrome/logo` — precisely so
 * this file can name a URL without a database lookup, and so re-running
 * `npm run migrate:assets` overwrites its own output instead of duplicating it.
 *
 * Files still live in `public/` after migration. They are the fallback, they
 * are what the migration re-uploads from, and deleting them to save 2.7 MB in
 * the repo would trade a rebuild for an outage the first time Cloudinary is
 * unreachable.
 */
const SITE_ASSET_FILES = {
  logo: "logo.webp",
  letterLogo: "letter-logo.webp",
  hudWinner: "hud-winner.webp",
  ogImage: "og-image.jpg",
  bgMarble: "bg-marble.webp",
  overlay1: "overlay-1.webp",
  overlay2: "overlay-2.webp",
  "icons/tv": "icons/tv.webp",
  "icons/clipboard": "icons/clipboard.webp",
  "icons/trophy": "icons/trophy.webp",
  "icons/crown": "icons/crown.webp",
} as const satisfies Record<string, string>;

export type SiteAssetName = keyof typeof SITE_ASSET_FILES;

/** Every asset the migration uploads, as `[name, public/ path]`. */
export const SITE_ASSET_ENTRIES = Object.entries(SITE_ASSET_FILES) as [SiteAssetName, string][];

/** The full public ID a site asset is stored under, root folder and all. */
export function siteAssetPublicId(name: SiteAssetName): string {
  return `${CLOUDINARY_FOLDER}/${SITE_ASSET_FOLDER}/${name}`;
}

/**
 * Where to load a site asset from *right now*. No version segment: these are
 * overwritten in place rather than re-uploaded under a new ID, so an unversioned
 * URL is the one that keeps working after the next migration run.
 */
export function siteAsset(name: SiteAssetName): string {
  if (!cloudStorageEnabled) return `/${SITE_ASSET_FILES[name]}`;

  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${PASSTHROUGH_TRANSFORMATION}/${siteAssetPublicId(name)}`;
}
