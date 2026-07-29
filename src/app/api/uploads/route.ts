import { currentActor, requirePermission } from "@/lib/authz";
import { UPLOAD_RATE_LIMITS, formatRetryAfter, rateLimit } from "@/lib/rate-limit";
import { StorageError, uploadForPreset } from "@/lib/storage";
import {
  MAX_UPLOAD_BYTES,
  getUploadPreset,
  type UploadPreset,
  type UploadResponse,
} from "@/lib/storage/shared";

/**
 * The one endpoint that puts an image somewhere (Phase 6.6, reworked).
 *
 * Every uploader in the app — team crests, game cards, avatars — posts here
 * with a `preset`, and the preset decides both the permission required and
 * where the file lands. That is the whole point: the admin panel gains an
 * image field by naming a preset, not by growing another upload path.
 *
 * The browser has already resized to the preset's target, so a body arriving
 * here is a couple of hundred kilobytes. `MAX_UPLOAD_BYTES` is the backstop for
 * a caller that skipped that step; the real 8 MB source check is client-side,
 * where the megapixels still are.
 *
 * `src/proxy.ts` already turns away anyone signed out, but a route handler is a
 * public POST and the permission check below is what actually holds.
 */
export const runtime = "nodejs"; // `lib/storage/cloudinary.ts` signs with `node:crypto`.

export async function POST(request: Request): Promise<Response> {
  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return fail("Send the image as multipart/form-data.", 400);
  }

  const preset = getUploadPreset(String(form.get("preset") ?? ""));
  if (!preset) return fail("Unknown upload preset.", 400);

  const actor = await authorize(preset);
  if (!actor) return fail("You don't have permission to upload that.", 403);

  const limit = rateLimit(`upload:${actor.id}`, UPLOAD_RATE_LIMITS.image);
  if (!limit.ok) {
    return fail(`Too many uploads. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.`, 429);
  }

  const file = form.get("file");

  if (!(file instanceof Blob)) return fail("No image was attached.", 400);
  if (!file.type.startsWith("image/")) return fail("That file isn't an image.", 415);
  if (file.size === 0) return fail("That image is empty.", 400);
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail(`That image is over ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`, 413);
  }

  try {
    const asset = await uploadForPreset(preset, new Uint8Array(await file.arrayBuffer()), file.type);

    return Response.json({
      ok: true,
      url: asset.url,
      provider: asset.provider,
      bytes: asset.bytes,
    } satisfies UploadResponse);
  } catch (error) {
    // A StorageError is something the admin can act on (wrong preset for the
    // configured provider, provider refused the file) — anything else is ours.
    if (error instanceof StorageError) return fail(error.message, 422);

    console.error("[uploads] failed", error);
    return fail("The image could not be stored. Try again.", 500);
  }
}

/** Admin presets re-check the permission against the database; avatars only need a session. */
function authorize(preset: UploadPreset) {
  return preset.permission ? requirePermission(preset.permission) : currentActor();
}

function fail(error: string, status: number): Response {
  return Response.json({ ok: false, error } satisfies UploadResponse, { status });
}
