import { StorageError, type StorageProvider, type StoredAsset, type UploadInput } from "@/lib/storage/types";

/**
 * The no-configuration fallback: the asset becomes a data URL on the document
 * it belongs to. This is what the app did before Cloudinary (Phase 6.6) and it
 * stays the default so a fresh clone with nothing but `MONGODB_URI` can still
 * upload a crest.
 *
 * It only accepts what a Mongo document should reasonably carry — a 64×64 crest
 * is a couple of kilobytes, a 16:9 game card is not — so `maxInlineBytes` is
 * what decides whether a caller works here at all. One that doesn't fit gets a
 * "configure Cloudinary" error, not a document nobody wants to read.
 */
export function createInlineStorage(): StorageProvider {
  return {
    name: "inline",

    async upload({ data, contentType, maxInlineBytes, label }: UploadInput): Promise<StoredAsset> {
      if (maxInlineBytes === 0) {
        throw new StorageError(
          `${label} needs file storage. Set CLOUDINARY_* in .env.local, or point at a path under /public instead.`,
        );
      }

      if (data.byteLength > maxInlineBytes) {
        throw new StorageError(
          `That file is ${Math.round(data.byteLength / 1024)} KB, over the ${Math.round(
            maxInlineBytes / 1024,
          )} KB that can be stored without file storage. Set CLOUDINARY_* in .env.local.`,
        );
      }

      const base64 = Buffer.from(data).toString("base64");

      return {
        url: `data:${contentType};base64,${base64}`,
        publicId: null,
        provider: "inline",
        bytes: data.byteLength,
      };
    },

    // The asset lives in the document; deleting the document deletes it.
    async remove(): Promise<boolean> {
      return false;
    },

    publicIdFromUrl() {
      return null;
    },
  };
}
