import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createCloudinaryStorage,
  deliveryUrl,
  publicIdFromUrl,
  signParams,
} from "@/lib/storage/cloudinary";
import { createInlineStorage } from "@/lib/storage/inline";
import {
  PASSTHROUGH_TRANSFORMATION,
  UPLOAD_PRESETS,
  VIDEO_TRANSFORMATION,
  presetTransformation,
} from "@/lib/storage/shared";
import { StorageError } from "@/lib/storage/types";

/**
 * Image and video storage.
 *
 * Nothing here touches the network — the parts worth guarding are the ones a
 * broken deploy would only reveal against a live account:
 *
 *  1. the upload signature is exactly what Cloudinary recomputes, or every
 *     upload comes back 401 and the message says nothing useful;
 *  2. a delivery URL round-trips back to its public ID, because that is the
 *     only thing standing between an edit and an orphaned asset;
 *  3. the inline fallback refuses what a Mongo document should not carry.
 */
const CLOUD = "test-cloud";
const SECRET = "test-secret";

const CREST = presetTransformation(UPLOAD_PRESETS["team-crest"]);

describe("cloudinary signing", () => {
  it("signs the sorted parameters with the secret appended", () => {
    const signature = signParams({ timestamp: 1700000000, folder: "buggedout/teams" }, SECRET);

    // Cloudinary's own recipe, spelled out rather than reusing the helper.
    const expected = createHash("sha1")
      .update(`folder=buggedout/teams&timestamp=1700000000${SECRET}`)
      .digest("hex");

    expect(signature).toBe(expected);
  });

  it("does not depend on the order the parameters were written in", () => {
    expect(signParams({ b: "2", a: "1" }, SECRET)).toBe(signParams({ a: "1", b: "2" }, SECRET));
  });

  it("changes when the secret changes", () => {
    expect(signParams({ a: "1" }, SECRET)).not.toBe(signParams({ a: "1" }, "other-secret"));
  });

  it("covers the migration's extra parameters", () => {
    // A signature computed over fewer keys than the body carries is a 401, so
    // public_id and overwrite have to be in here.
    const signed = signParams(
      { folder: "buggedout/games", overwrite: "true", public_id: "lane-races", timestamp: 1700000000 },
      SECRET,
    );

    const expected = createHash("sha1")
      .update(
        `folder=buggedout/games&overwrite=true&public_id=lane-races&timestamp=1700000000${SECRET}`,
      )
      .digest("hex");

    expect(signed).toBe(expected);
  });
});

describe("delivery urls", () => {
  const asset = { publicId: "buggedout/teams/abc123", version: 1712345678, format: "webp" };

  it("bakes the preset's crop into the url", () => {
    expect(deliveryUrl(CLOUD, asset, CREST)).toBe(
      `https://res.cloudinary.com/${CLOUD}/image/upload/c_fill,w_64,h_64,f_auto,q_auto/v1712345678/buggedout/teams/abc123.webp`,
    );
  });

  it("sizes a game card at its own delivery size, not the crest's", () => {
    const card = presetTransformation(UPLOAD_PRESETS["game-card"]);
    expect(deliveryUrl(CLOUD, asset, card)).toContain("w_800,h_450");
  });

  it("puts video on the video path", () => {
    const video = { publicId: "buggedout/games/lane-races", version: 1, format: "mp4" };

    expect(deliveryUrl(CLOUD, video, VIDEO_TRANSFORMATION, "video")).toBe(
      `https://res.cloudinary.com/${CLOUD}/video/upload/q_auto/v1/buggedout/games/lane-races.mp4`,
    );
  });

  it("round-trips back to the public id, image or video", () => {
    const transformations = [
      ...Object.values(UPLOAD_PRESETS).map(presetTransformation),
      PASSTHROUGH_TRANSFORMATION,
    ];

    for (const transformation of transformations) {
      expect(publicIdFromUrl(CLOUD, deliveryUrl(CLOUD, asset, transformation))).toEqual({
        publicId: asset.publicId,
        resourceType: "image",
      });
    }

    expect(
      publicIdFromUrl(CLOUD, deliveryUrl(CLOUD, asset, VIDEO_TRANSFORMATION, "video")),
    ).toEqual({ publicId: asset.publicId, resourceType: "video" });
  });

  it("reads a public id out of an untransformed url", () => {
    const url = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/buggedout/teams/abc123.webp`;
    expect(publicIdFromUrl(CLOUD, url)?.publicId).toBe("buggedout/teams/abc123");
  });

  it("claims nothing it does not own", () => {
    const cases = [
      "/game-cards/lane-races.webp",
      "data:image/webp;base64,AAAA",
      "https://example.com/whatever.webp",
      // Right host, someone else's account — deleting from it is not ours to do.
      "https://res.cloudinary.com/other-cloud/image/upload/v1/x.webp",
    ];

    for (const url of cases) {
      expect(publicIdFromUrl(CLOUD, url)).toBeNull();
    }
  });

  it("exposes the same parser through the provider it was configured with", () => {
    const storage = createCloudinaryStorage({
      cloudName: CLOUD,
      apiKey: "key",
      apiSecret: SECRET,
      folder: "buggedout",
    });

    expect(storage.name).toBe("cloudinary");
    expect(storage.publicIdFromUrl(deliveryUrl(CLOUD, asset, CREST))?.publicId).toBe(
      asset.publicId,
    );
  });
});

describe("inline fallback", () => {
  const storage = createInlineStorage();

  const base = {
    folder: "teams",
    transformation: CREST,
    maxInlineBytes: UPLOAD_PRESETS["team-crest"].maxInlineBytes,
    label: "Team crests",
  };

  it("encodes a small crest as a data url", async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const stored = await storage.upload({ ...base, data, contentType: "image/webp" });

    expect(stored.url).toBe(`data:image/webp;base64,${Buffer.from(data).toString("base64")}`);
    expect(stored.bytes).toBe(4);
    // Nothing to delete later: the image is the document.
    expect(stored.publicId).toBeNull();
  });

  it("refuses a caller that can never live in a document", async () => {
    await expect(
      storage.upload({
        ...base,
        data: new Uint8Array([1]),
        contentType: "image/webp",
        maxInlineBytes: 0,
        label: "Game cards",
      }),
    ).rejects.toBeInstanceOf(StorageError);
  });

  it("refuses a file over the inline ceiling", async () => {
    await expect(
      storage.upload({
        ...base,
        data: new Uint8Array(base.maxInlineBytes + 1),
        contentType: "image/webp",
      }),
    ).rejects.toThrow(/CLOUDINARY/);
  });
});
