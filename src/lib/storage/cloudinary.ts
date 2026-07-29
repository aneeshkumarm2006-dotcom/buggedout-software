import { createHash } from "node:crypto";

import { StorageError, type StorageProvider, type StoredAsset, type UploadInput } from "@/lib/storage/types";

/**
 * Cloudinary, over its REST API rather than the `cloudinary` SDK.
 *
 * The signed upload endpoint is a multipart POST and a SHA-1 of the sorted
 * parameters — about forty lines — against an SDK that pulls in its own HTTP
 * stack and a streaming layer this app never touches. Fewer dependencies also
 * means nothing to keep in step with the Node runtime Vercel happens to be on.
 *
 * Delivery URLs are built with the transformation already in them, so Cloudinary
 * does the resizing and the format negotiation and `AssetImage` can render the
 * URL with a plain `<img>`. Sending it through `next/image` as well would pay
 * twice for the same work and burn Vercel's optimisation quota re-encoding
 * something already served as AVIF.
 */
export type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Root folder every upload nests under, e.g. `buggedout`. */
  folder: string;
};

const API_BASE = "https://api.cloudinary.com/v1_1";
const DELIVERY_BASE = "https://res.cloudinary.com";

export type ResourceType = "image" | "video";

/**
 * Cloudinary's signature: every signed parameter sorted by key, joined
 * `k=v&k=v`, the API secret appended raw, SHA-1 hex. `file`, `api_key`,
 * `resource_type` and `cloud_name` are excluded by the protocol.
 */
export function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHash("sha1").update(`${canonical}${apiSecret}`).digest("hex");
}

export function deliveryUrl(
  cloudName: string,
  asset: { publicId: string; version: number; format: string },
  transformation: string,
  resourceType: ResourceType = "image",
): string {
  const path = transformation
    ? `${transformation}/v${asset.version}`
    : `v${asset.version}`;

  return `${DELIVERY_BASE}/${cloudName}/${resourceType}/upload/${path}/${asset.publicId}.${asset.format}`;
}

/**
 * The inverse, for cleaning up a replaced asset. Our own URLs always carry a
 * `v<number>` segment, which is the only unambiguous marker of where the
 * transformation stops and the public ID begins — a public ID may itself
 * contain slashes.
 */
export function publicIdFromUrl(
  cloudName: string,
  url: string,
): { publicId: string; resourceType: ResourceType } | null {
  for (const resourceType of ["image", "video"] as const) {
    const prefix = `${DELIVERY_BASE}/${cloudName}/${resourceType}/upload/`;
    if (!url.startsWith(prefix)) continue;

    const segments = url.slice(prefix.length).split("/");
    const versionAt = segments.findIndex((segment) => /^v\d+$/.test(segment));

    // No version segment: assume at most one leading transformation, which is
    // what every URL this app writes looks like.
    const rest =
      versionAt >= 0
        ? segments.slice(versionAt + 1)
        : segments.length > 1
          ? segments.slice(1)
          : segments;

    const path = rest.join("/");
    if (path === "") return null;

    // Drop the extension, but only a real one — a dot inside a folder name is not.
    return { publicId: path.replace(/\.[a-z0-9]{2,5}$/i, ""), resourceType };
  }

  return null;
}

type UploadSuccess = {
  public_id: string;
  version: number;
  format: string;
  bytes: number;
  secure_url: string;
};

export function createCloudinaryStorage(config: CloudinaryConfig): StorageProvider {
  return {
    name: "cloudinary",

    async upload(input: UploadInput): Promise<StoredAsset> {
      const resourceType = input.resourceType ?? "image";
      const timestamp = Math.floor(Date.now() / 1000);
      const folder = `${config.folder}/${input.folder}`;

      // Only what is actually sent gets signed — an extra key in here that is
      // not in the body (or the reverse) is a 401 with an unhelpful message.
      const signed: Record<string, string | number> = { folder, timestamp };
      if (input.publicId) signed.public_id = input.publicId;
      if (input.overwrite) signed.overwrite = "true";

      const body = new FormData();
      body.set("file", new Blob([input.data as BlobPart], { type: input.contentType }), "upload");
      body.set("api_key", config.apiKey);
      body.set("timestamp", String(timestamp));
      body.set("folder", folder);
      if (input.publicId) body.set("public_id", input.publicId);
      if (input.overwrite) body.set("overwrite", "true");
      body.set("signature", signParams(signed, config.apiSecret));

      const response = await fetch(`${API_BASE}/${config.cloudName}/${resourceType}/upload`, {
        method: "POST",
        body,
      });

      if (!response.ok) {
        throw new StorageError(`Cloudinary rejected the upload: ${await errorMessage(response)}`);
      }

      const result = (await response.json()) as UploadSuccess;

      return {
        url: deliveryUrl(
          config.cloudName,
          { publicId: result.public_id, version: result.version, format: result.format },
          input.transformation,
          resourceType,
        ),
        publicId: result.public_id,
        provider: "cloudinary",
        bytes: result.bytes,
      };
    },

    async remove(publicId: string, resourceType: ResourceType = "image"): Promise<boolean> {
      const timestamp = Math.floor(Date.now() / 1000);

      const body = new FormData();
      body.set("api_key", config.apiKey);
      body.set("public_id", publicId);
      body.set("timestamp", String(timestamp));
      body.set("signature", signParams({ public_id: publicId, timestamp }, config.apiSecret));

      const response = await fetch(`${API_BASE}/${config.cloudName}/${resourceType}/destroy`, {
        method: "POST",
        body,
      });

      if (!response.ok) return false;

      const result = (await response.json()) as { result?: string };
      return result.result === "ok";
    },

    publicIdFromUrl(url: string) {
      return publicIdFromUrl(config.cloudName, url);
    },
  };
}

/** Cloudinary answers failures as `{ error: { message } }`; fall back to the status. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // Not JSON — the status line is all we have.
  }

  return `${response.status} ${response.statusText}`;
}
