import { createHash, timingSafeEqual } from "node:crypto";

import { lockExpiredQuestions } from "@/lib/betting";
import { env } from "@/lib/env";

/**
 * Scheduled auto-lock sweep (Phase 4.3): every market whose end time has passed
 * moves to `locked`.
 *
 * The read paths lock their own questions before serving them, so this is not
 * what keeps a late bet out — it is what stops the Pending Results queue from
 * only filling up when somebody happens to open the match page.
 *
 * Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`; Phase 9.7 adds
 * the schedule itself. Unauthenticated by design, so `src/proxy.ts` skips
 * `/api/cron` and the secret is the only thing standing in front of it.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const locked = await lockExpiredQuestions();

    // Shows up in the cron log, which is the only place anyone watches this.
    if (locked > 0) console.log(`[cron] locked ${locked} expired question(s)`);

    return Response.json({ ok: true, locked, ranAt: new Date().toISOString() });
  } catch (error) {
    console.error("[cron] lock sweep failed", error);
    return Response.json({ ok: false, error: "sweep_failed" }, { status: 500 });
  }
}

function isAuthorized(request: Request): boolean {
  // No secret configured: usable from a dev machine, refused everywhere else.
  if (!env.CRON_SECRET) return process.env.NODE_ENV !== "production";

  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : header;

  return constantTimeEquals(offered, env.CRON_SECRET);
}

function constantTimeEquals(a: string, b: string): boolean {
  // Hashed first so both buffers are always 32 bytes: `timingSafeEqual` throws
  // on a length mismatch, and that error path would leak the secret's length.
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
