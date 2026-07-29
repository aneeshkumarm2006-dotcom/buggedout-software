import "server-only";

import { env } from "@/lib/env";
import { createCloudinaryStorage } from "@/lib/storage/cloudinary";
import { createInlineStorage } from "@/lib/storage/inline";
import { presetTransformation, type UploadPreset } from "@/lib/storage/shared";
import type { StorageProvider, StoredAsset, UploadInput } from "@/lib/storage/types";

export { StorageError } from "@/lib/storage/types";
export type { StorageProvider, StoredAsset, UploadInput } from "@/lib/storage/types";

/**
 * Picks the provider once and hands it to everything that stores an image.
 *
 * Nothing outside this file knows which one it got: the route handler calls
 * `saveUpload`, the admin mutations call `discardAsset`, and both behave the
 * same whether Cloudinary is configured or the app is running on a laptop with
 * nothing but a database. Adding a provider is a new file plus a branch here.
 *
 * Memoised on `globalThis` for the same reason `lib/db.ts` and `lib/rate-limit.ts`
 * are — module state does not survive HMR, and rebuilding the provider on every
 * request would be pointless work.
 */
const globalForStorage = globalThis as typeof globalThis & {
  __storageProvider?: StorageProvider;
};

export function getStorage(): StorageProvider {
  if (globalForStorage.__storageProvider) return globalForStorage.__storageProvider;

  const provider =
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
      ? createCloudinaryStorage({
          cloudName: env.CLOUDINARY_CLOUD_NAME,
          apiKey: env.CLOUDINARY_API_KEY,
          apiSecret: env.CLOUDINARY_API_SECRET,
          folder: env.CLOUDINARY_FOLDER,
        })
      : createInlineStorage();

  globalForStorage.__storageProvider = provider;
  return provider;
}

export async function saveUpload(input: UploadInput): Promise<StoredAsset> {
  return getStorage().upload(input);
}

/** What `/api/uploads` calls: a form field's preset, turned into an upload. */
export async function uploadForPreset(
  preset: UploadPreset,
  data: Uint8Array,
  contentType: string,
): Promise<StoredAsset> {
  return saveUpload({
    data,
    contentType,
    folder: preset.folder,
    transformation: presetTransformation(preset),
    maxInlineBytes: preset.maxInlineBytes,
    label: `${preset.id} images`,
  });
}

/**
 * Deletes a stored image if the active provider owns it — best effort, and
 * never a reason to fail the mutation that triggered it. A site path, a data
 * URL or a URL from some other host is left alone.
 *
 * Called on replace and on delete so the Cloudinary account doesn't accumulate
 * a crest for every edit anybody ever made.
 */
export async function discardAsset(url: string | null | undefined): Promise<void> {
  if (!url) return;

  const storage = getStorage();
  const owned = storage.publicIdFromUrl(url);
  if (!owned) return;

  try {
    await storage.remove(owned.publicId, owned.resourceType);
  } catch (error) {
    console.error("[storage] could not remove", owned.publicId, error);
  }
}

/** `discardAsset`, but a no-op when the image did not actually change. */
export async function discardReplacedAsset(
  previous: string | null | undefined,
  next: string | null | undefined,
): Promise<void> {
  if (!previous || previous === next) return;
  await discardAsset(previous);
}
