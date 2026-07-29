"use client";

import { useRef, useState } from "react";
import { ImageUpIcon, Loader2Icon, XIcon } from "lucide-react";

import { AssetImage } from "@/components/common/asset-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The team crest uploader (Phase 6.6).
 *
 * There is no file storage in the MVP, so the picture is resized to exactly
 * `size`×`size` in the browser and stored as a data URL on the Team document —
 * a 64×64 WebP is two or three kilobytes, which a Mongo document carries
 * without complaint. Doing the resize here rather than server-side also means a
 * 12-megapixel phone photo never leaves the machine that took it.
 *
 * A path or URL can be typed instead, for artwork that already lives in
 * `public/`. Both shapes satisfy the `imagePath` schema.
 */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export function ImageUploadField({
  label,
  name,
  defaultValue,
  error,
  size = 64,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  error?: string;
  size?: number;
  hint?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLocalError("That file isn't an image.");
      return;
    }

    if (file.size > MAX_SOURCE_BYTES) {
      setLocalError("Pick an image under 8 MB.");
      return;
    }

    setBusy(true);
    setLocalError(null);

    try {
      setValue(await resizeToSquare(file, size));
    } catch {
      setLocalError("That image could not be read. Try a PNG or JPEG.");
    } finally {
      setBusy(false);
      // Clearing lets the same file be picked again after a failure.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const message = localError ?? error;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${name}-url`}>{label}</Label>

      {/* What actually posts — a data URL from the canvas, or a typed path. */}
      <input type="hidden" name={name} value={value} />

      <div className="flex items-start gap-3">
        <div
          className="bg-muted ring-foreground/10 relative shrink-0 overflow-hidden rounded-lg ring-1"
          style={{ width: size, height: size }}
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
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />

            <Button asChild variant="outline" size="lg" className="cursor-pointer">
              <label htmlFor={`${name}-file`}>
                <ImageUpIcon />
                Upload image
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
            value={value.startsWith("data:") ? "" : value}
            placeholder={`/teams/turtle-a.webp — or upload, resized to ${size}×${size}`}
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
        <p className={cn("text-destructive text-xs")}>{message}</p>
      ) : (
        <p className="text-muted-foreground text-xs">
          {hint ?? `Uploads are cropped to ${size}×${size} in your browser before they are saved.`}
        </p>
      )}
    </div>
  );
}

/**
 * Cover-crops to a square and encodes it. WebP is a third the size of PNG at
 * this scale, but `toDataURL` silently falls back to PNG where it isn't
 * supported — the returned string is checked rather than assumed.
 */
async function resizeToSquare(file: File, size: number): Promise<string> {
  const image = await loadImage(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");

    // Scale so the shorter side fills the square, then centre the overflow.
    const scale = Math.max(size / image.width, size / image.height);
    const width = image.width * scale;
    const height = image.height * scale;

    context.imageSmoothingQuality = "high";
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);

    const webp = canvas.toDataURL("image/webp", 0.9);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(image.src);
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not decode image"));
    };

    image.src = url;
  });
}
