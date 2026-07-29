/**
 * The seam every image upload goes through.
 *
 * `lib/mailer.ts` swaps a transport by replacing one function body; storage
 * needs a little more than that because two providers coexist — Cloudinary when
 * it is configured, inline data URLs when it is not — so it is an interface
 * rather than a function. Adding S3 or UploadThing later means one new file
 * implementing this and one line in `index.ts`; no call site changes.
 */
export type StoredAsset = {
  /** What gets written to `Team.image` / `GameCategory.cardImage` / `User.avatar`. */
  url: string;
  /** Provider handle for deletion. `null` when there is nothing to delete (inline data URLs). */
  publicId: string | null;
  /** Provider name, for logs and the upload response. */
  provider: string;
  /** Size of the stored image in bytes. */
  bytes: number;
};

/**
 * Deliberately lower-level than a preset. A preset is a *form field's* idea of
 * an upload — crop, permission, preview box — and the migration script has none
 * of those. `uploadForPreset` translates one into the other, so the provider
 * only ever deals in bytes, a folder and a transformation.
 */
export type UploadInput = {
  data: Uint8Array;
  /** MIME type of `data`. */
  contentType: string;
  /** Sub-folder under the storage root. */
  folder: string;
  /** Baked into the returned URL, e.g. `c_fill,w_64,h_64,f_auto,q_auto`. */
  transformation: string;
  resourceType?: "image" | "video";
  /**
   * Deterministic ID, so re-running a migration overwrites its own output
   * instead of duplicating it. Omitted for user uploads, which get a random one.
   */
  publicId?: string;
  overwrite?: boolean;
  /** Inline-fallback ceiling in bytes. `0` forbids the fallback outright. */
  maxInlineBytes: number;
  /** Names the caller in the "configure Cloudinary" error. */
  label: string;
};

export type StorageProvider = {
  name: string;
  upload(input: UploadInput): Promise<StoredAsset>;
  /** Best-effort; resolves `false` when the asset was already gone. */
  remove(publicId: string, resourceType?: "image" | "video"): Promise<boolean>;
  /**
   * Recognises a stored URL as this provider's, so a replaced asset can be
   * cleaned up without adding a `publicId` column to three models. Returns
   * `null` for anything it does not own.
   */
  publicIdFromUrl(url: string): { publicId: string; resourceType: "image" | "video" } | null;
};

/** Thrown for anything the admin can act on — the message reaches the form. */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}
