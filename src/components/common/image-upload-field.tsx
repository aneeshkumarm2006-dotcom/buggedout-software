"use client";

import { useRef, useState } from "react";
import { ImageUpIcon, Loader2Icon, XIcon } from "lucide-react";

import { AssetImage } from "@/components/common/asset-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_SOURCE_BYTES,
  UPLOAD_ENDPOINT,
  UPLOAD_PRESETS,
  cloudStorageEnabled,
  type UploadPresetId,
  type UploadResponse,
} from "@/lib/storage/shared";

/**
 * The image field behind every uploader in the app — team crests, game cards,
 * profile avatars.
 *
 * It knows one thing the server doesn't: the picture. So the crop and the
 * re-encode happen here, and a 12-megapixel phone photo never leaves the
 * machine that took it. What gets posted to `/api/uploads` is already the right
 * shape and a couple of hundred kilobytes; the endpoint decides where it lands.
 *
 * The resize target depends on whether cloud storage is configured. With
 * Cloudinary the browser sends the preset's `source` and the CDN re-crops per
 * delivery URL; without it, the image is about to become a data URL on a Mongo
 * document, so it is sent at `delivery` size instead. Both paths post the same
 * request — only the number changes.
 *
 * A path or URL can still be typed instead, for artwork that already lives in
 * `public/`. Both shapes satisfy the `imagePath` schema.
 */
export function ImageUploadField({
  label,
  name,
  preset: presetId,
  defaultValue,
  error,
  hint,
  placeholder,
  onValueChange,
}: {
  label: string;
  name: string;
  preset: UploadPresetId;
  defaultValue?: string | null;
  error?: string;
  hint?: string;
  placeholder?: string;
  /**
   * Notified whenever the stored reference changes. Forms don't need it — the
   * hidden input below posts for them — but a caller outside a server action,
   * like the in-place "add a competitor" dialog, has no FormData to read and
   * needs the value in its own state.
   */
  onValueChange?: (value: string) => void;
}) {
  const preset = UPLOAD_PRESETS[presetId];

  const [value, setValueState] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const target = cloudStorageEnabled ? preset.source : preset.delivery;

  function setValue(next: string) {
    setValueState(next);
    onValueChange?.(next);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLocalError("That file isn't an image.");
      return;
    }

    if (file.size > MAX_SOURCE_BYTES) {
      setLocalError(`Pick an image under ${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)} MB.`);
      return;
    }

    setBusy(true);
    setLocalError(null);

    try {
      const resized = await resizeToCover(file, target.width, target.height);
      setValue(await upload(resized, presetId));
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "That image could not be uploaded.");
    } finally {
      setBusy(false);
      // Clearing lets the same file be picked again after a failure.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const message = localError ?? error;
  const isUploaded = value.startsWith("data:") || value.startsWith("http");

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${name}-url`}>{label}</Label>

      {/* What actually posts — the stored URL, or a typed path. */}
      <input type="hidden" name={name} value={value} />

      <div className="flex items-start gap-3">
        <div
          className="bg-muted ring-foreground/10 relative shrink-0 overflow-hidden rounded-lg ring-1"
          style={{ width: preset.preview.width, height: preset.preview.height }}
        >
          <AssetImage src={value || null} alt="" fill className="object-cover" />

          {busy ? (
            <span className="bg-background/70 absolute inset-0 grid place-content-center">
              <Loader2Icon className="size-4 animate-spin" />
            </span>
          ) : null}
        </div>

        <div className="grid min-w-0 flex-1 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              id={`${name}-file`}
              disabled={busy}
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />

            <Button asChild variant="outline" size="lg" className="cursor-pointer">
              <label htmlFor={`${name}-file`}>
                <ImageUpIcon />
                {busy ? "Uploading…" : "Upload image"}
              </label>
            </Button>

            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => {
                  setValue("");
                  setLocalError(null);
                }}
              >
                <XIcon />
                Clear
              </Button>
            ) : null}
          </div>

          <Input
            id={`${name}-url`}
            // An uploaded image has no path worth showing — a data URL is
            // unreadable and a CDN URL is nobody's idea of an editable value.
            value={isUploaded ? "" : value}
            placeholder={placeholder ?? "/teams/turtle-a.webp — or upload"}
            aria-invalid={message ? true : undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setLocalError(null);
            }}
            className="h-11 md:h-10"
          />
        </div>
      </div>

      {message ? (
        <p className="text-destructive text-xs">{message}</p>
      ) : (
        <p className="text-muted-foreground text-xs">
          {hint ??
            `Uploads are cropped to ${preset.delivery.width}×${preset.delivery.height} before they are saved.`}
        </p>
      )}
    </div>
  );
}

/** Posts the resized image and returns the stored URL. */
async function upload(image: Blob, preset: UploadPresetId): Promise<string> {
  const body = new FormData();
  body.set("preset", preset);
  body.set("file", image, "upload");

  const response = await fetch(UPLOAD_ENDPOINT, { method: "POST", body });

  // A signed-out session is bounced by the proxy into an HTML login page, which
  // is not the JSON this expects — hence the guarded parse.
  const result = (await response.json().catch(() => null)) as UploadResponse | null;

  if (!result) throw new Error("The upload failed. Check you are still signed in.");
  if (!result.ok) throw new Error(result.error);

  return result.url;
}

/**
 * Cover-crops to `width`×`height` and re-encodes. WebP is a third the size of
 * PNG at these dimensions, but `toBlob` silently falls back where it isn't
 * supported — the returned type is checked rather than assumed.
 */
async function resizeToCover(file: File, width: number, height: number): Promise<Blob> {
  const image = await loadImage(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("That image could not be read.");

    // Scale so the shorter side fills the box, then centre the overflow.
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;

    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );

    return await encode(canvas);
  } finally {
    URL.revokeObjectURL(image.src);
  }
}

function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("That image could not be encoded. Try a PNG or JPEG."));
      },
      "image/webp",
      0.9,
    );
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be read. Try a PNG or JPEG."));
    };

    image.src = url;
  });
}
