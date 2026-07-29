import { readFile } from "node:fs/promises";
import path from "node:path";

import { connectDB, disconnectDB } from "@/lib/db";
import { SITE_ASSET_ENTRIES, siteAssetPublicId } from "@/lib/site-assets";
import { getStorage, saveUpload } from "@/lib/storage";
import {
  PASSTHROUGH_TRANSFORMATION,
  SITE_ASSET_FOLDER,
  UPLOAD_PRESETS,
  VIDEO_TRANSFORMATION,
  presetTransformation,
} from "@/lib/storage/shared";
import { GameCategory, Team, User } from "@/models";

/**
 * One-shot move of everything the app already had onto the configured storage
 * provider — game cards, hover videos, team crests, avatars and site chrome.
 *
 *   npm run migrate:assets            # dry run: prints the plan, writes nothing
 *   npm run migrate:assets -- --commit
 *
 * Two properties make it safe to run twice. Every upload gets a **deterministic
 * public ID** derived from the row it belongs to (`buggedout/games/lane-races`)
 * with `overwrite`, so a re-run replaces its own output rather than filling the
 * account with copies. And anything already pointing at the provider is skipped,
 * so a half-finished run resumes instead of starting over.
 *
 * Source files under `public/` are left in place. They are what a re-run reads
 * from, and they are the fallback `lib/site-assets.ts` serves when Cloudinary is
 * not configured.
 */
const PUBLIC_DIR = path.join(process.cwd(), "public");

const commit = process.argv.includes("--commit");

type Plan = {
  what: string;
  from: string;
  /**
   * `row` assets are recorded in the database, so a completed one is skipped on
   * the next run. `chrome` is named in code with a fixed public ID and has
   * nothing to compare against, so it is always re-uploaded — harmless, because
   * it overwrites itself, but worth labelling so a re-run does not read as work
   * left undone.
   */
  kind: "row" | "chrome";
  /** Resolves to the new URL. Only called when committing. */
  run: () => Promise<string>;
  /** Writes the new URL back to the database. */
  save: (url: string) => Promise<void>;
};

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function contentTypeFor(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** `data:image/svg+xml;base64,…` → the bytes and the MIME type inside it. */
function decodeDataUrl(value: string): { data: Uint8Array; contentType: string } {
  // `[\s\S]` rather than the `s` flag: tsconfig targets ES2017 for the app.
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(value);
  if (!match) throw new Error("not a data URL");

  const [, contentType, base64, payload] = match;

  return {
    data: new Uint8Array(Buffer.from(base64 ? payload! : decodeURIComponent(payload!), base64 ? "base64" : "utf8")),
    contentType: contentType!,
  };
}

async function readPublicFile(relative: string): Promise<{ data: Uint8Array; contentType: string }> {
  const file = path.join(PUBLIC_DIR, relative);
  return { data: new Uint8Array(await readFile(file)), contentType: contentTypeFor(file) };
}

/** Already on the provider? Then there is nothing to do for this field. */
function alreadyMigrated(value: string | null | undefined): boolean {
  return !!value && getStorage().publicIdFromUrl(value) !== null;
}

/** `/game-cards/lane-races.webp` → `game-cards/lane-races.webp`. */
function toPublicRelative(value: string): string {
  return value.replace(/^\//, "");
}

/** Slug-ish, so a public ID is readable in the Cloudinary console. */
function idFor(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function buildPlans(): Promise<Plan[]> {
  const plans: Plan[] = [];

  /* ---------------- site chrome ---------------- */

  for (const [name, file] of SITE_ASSET_ENTRIES) {
    plans.push({
      what: `chrome ${name}`,
      from: `/${file}`,
      kind: "chrome",
      run: async () => {
        const { data, contentType } = await readPublicFile(file);
        const asset = await saveUpload({
          data,
          contentType,
          folder: SITE_ASSET_FOLDER,
          transformation: PASSTHROUGH_TRANSFORMATION,
          // `siteAsset()` builds this exact ID, so it must not drift.
          publicId: name,
          overwrite: true,
          maxInlineBytes: 0,
          label: "Site chrome",
        });

        if (asset.publicId !== siteAssetPublicId(name)) {
          throw new Error(
            `public ID drift: uploaded ${asset.publicId}, site-assets.ts expects ${siteAssetPublicId(name)}`,
          );
        }

        return asset.url;
      },
      // Chrome is named in code, not stored in a row — nothing to write back.
      save: async () => {},
    });
  }

  /* ---------------- game categories ---------------- */

  const categories = await GameCategory.find({}).select("title slug cardImage animatedCard").lean();

  for (const category of categories) {
    if (category.cardImage && !alreadyMigrated(category.cardImage)) {
      plans.push({
        what: `card    ${category.title}`,
        kind: "row",
        from: category.cardImage,
        run: async () => {
          const { data, contentType } = await readPublicFile(toPublicRelative(category.cardImage));
          const asset = await saveUpload({
            data,
            contentType,
            folder: UPLOAD_PRESETS["game-card"].folder,
            transformation: presetTransformation(UPLOAD_PRESETS["game-card"]),
            publicId: idFor(category.slug),
            overwrite: true,
            maxInlineBytes: 0,
            label: "Game cards",
          });
          return asset.url;
        },
        save: async (url) => {
          await GameCategory.updateOne({ _id: category._id }, { $set: { cardImage: url } });
        },
      });
    }

    if (category.animatedCard && !alreadyMigrated(category.animatedCard)) {
      plans.push({
        what: `video   ${category.title}`,
        kind: "row",
        from: category.animatedCard,
        run: async () => {
          const { data, contentType } = await readPublicFile(
            toPublicRelative(category.animatedCard!),
          );
          const asset = await saveUpload({
            data,
            contentType,
            folder: UPLOAD_PRESETS["game-card"].folder,
            transformation: VIDEO_TRANSFORMATION,
            resourceType: "video",
            publicId: idFor(category.slug),
            overwrite: true,
            maxInlineBytes: 0,
            label: "Hover videos",
          });
          return asset.url;
        },
        save: async (url) => {
          await GameCategory.updateOne({ _id: category._id }, { $set: { animatedCard: url } });
        },
      });
    }
  }

  /* ---------------- teams ---------------- */

  const teams = await Team.find({}).select("name image categoryId").lean();

  for (const team of teams) {
    if (!team.image || alreadyMigrated(team.image)) continue;

    plans.push({
      what: `crest   ${team.name}`,
      kind: "row",
      from: team.image.startsWith("data:") ? `inline ${team.image.length} chars` : team.image,
      run: async () => {
        const source = team.image.startsWith("data:")
          ? decodeDataUrl(team.image)
          : await readPublicFile(toPublicRelative(team.image));

        const asset = await saveUpload({
          ...source,
          folder: UPLOAD_PRESETS["team-crest"].folder,
          transformation: presetTransformation(UPLOAD_PRESETS["team-crest"]),
          // Team names are unique per game, not globally — the ID carries the
          // row so two "Lane 1"s in different games can't collide.
          publicId: `${idFor(team.name)}-${team._id.toString().slice(-6)}`,
          overwrite: true,
          maxInlineBytes: 0,
          label: "Team crests",
        });

        return asset.url;
      },
      save: async (url) => {
        await Team.updateOne({ _id: team._id }, { $set: { image: url } });
      },
    });
  }

  /* ---------------- avatars ---------------- */

  const users = await User.find({ avatar: { $nin: [null, ""] } })
    .select("username avatar")
    .lean();

  for (const user of users) {
    if (!user.avatar || alreadyMigrated(user.avatar)) continue;
    // A remote avatar is somebody else's URL, not an asset of ours to move.
    if (/^https?:\/\//.test(user.avatar)) continue;

    plans.push({
      what: `avatar  ${user.username}`,
      kind: "row",
      from: user.avatar.startsWith("data:") ? `inline ${user.avatar.length} chars` : user.avatar,
      run: async () => {
        const source = user.avatar!.startsWith("data:")
          ? decodeDataUrl(user.avatar!)
          : await readPublicFile(toPublicRelative(user.avatar!));

        const asset = await saveUpload({
          ...source,
          folder: UPLOAD_PRESETS.avatar.folder,
          transformation: presetTransformation(UPLOAD_PRESETS.avatar),
          publicId: user._id.toString(),
          overwrite: true,
          maxInlineBytes: 0,
          label: "Avatars",
        });

        return asset.url;
      },
      save: async (url) => {
        await User.updateOne({ _id: user._id }, { $set: { avatar: url } });
      },
    });
  }

  return plans;
}

async function main() {
  await connectDB();

  const storage = getStorage();

  if (storage.name !== "cloudinary") {
    console.error(
      `Storage provider is "${storage.name}", not cloudinary.\n` +
        "Set CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET in .env.local first.",
    );
    await disconnectDB();
    process.exit(1);
  }

  const plans = await buildPlans();
  const pending = plans.filter((plan) => plan.kind === "row").length;
  const refreshed = plans.length - pending;

  console.log(
    `\n${pending} asset(s) to migrate, ${refreshed} chrome file(s) to refresh` +
      `${commit ? "" : "  —  DRY RUN, nothing will be written"}\n`,
  );

  if (pending === 0) {
    console.log("Every database-backed asset already points at the provider.");
    if (refreshed > 0) console.log("Chrome is re-uploaded in place on every run; that is expected.\n");
  }

  if (plans.length === 0) {
    await disconnectDB();
    return;
  }

  let done = 0;
  let failed = 0;

  for (const plan of plans) {
    if (!commit) {
      console.log(`  ${plan.what.padEnd(28)} ${plan.from}`);
      continue;
    }

    try {
      const url = await plan.run();
      await plan.save(url);
      done += 1;
      console.log(`  ✓ ${plan.what.padEnd(28)} ${url}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${plan.what.padEnd(28)} ${(error as Error).message}`);
    }
  }

  console.log(
    commit
      ? `\nDone. ${done} migrated, ${failed} failed.`
      : "\nRe-run with --commit to upload and rewrite the database.",
  );

  await disconnectDB();
  if (failed > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
