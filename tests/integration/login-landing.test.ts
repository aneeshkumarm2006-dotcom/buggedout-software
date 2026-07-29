import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/lib/form";

/**
 * Where `loginAction` sends a fresh session.
 *
 * Nothing in the player UI links to `/admin`, so staff opening on the lobby had
 * to type the URL. Landing them on the panel instead must not cost the one
 * thing `callbackUrl` exists for: arriving at the page the proxy bounced you
 * off, rather than wherever your role usually starts.
 *
 * `signIn` is mocked to succeed — the credential check itself belongs to
 * `authorize()`, and what is under test is only the destination that follows.
 * `redirect()` works by throwing, so the URL is read off the thrown signal.
 */

const { RedirectSignal } = vi.hoisted(() => ({
  RedirectSignal: class RedirectSignal extends Error {
    constructor(readonly url: string) {
      super(`NEXT_REDIRECT ${url}`);
      this.name = "RedirectSignal";
    }
  },
}));

vi.mock("@/auth", () => ({
  auth: async () => null,
  signIn: async () => undefined,
  signOut: async () => undefined,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: <T>(fn: T) => fn,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}));

const { loginAction } = await import("@/app/(auth)/actions");
const factories = await import("../helpers/factories");

const EMPTY_STATE: FormState = { status: "idle" };

/** Runs the login and hands back the path it redirected to. */
async function landsOn(fields: Record<string, string>): Promise<string> {
  const data = new FormData();
  for (const [key, value] of Object.entries({ password: "irrelevant-here", ...fields })) {
    data.append(key, value);
  }

  const outcome = await loginAction(EMPTY_STATE, data).then(
    (state) => state,
    (error: unknown) => error,
  );

  if (!(outcome instanceof RedirectSignal)) {
    throw new Error(`expected a redirect, got ${JSON.stringify(outcome)}`);
  }

  return outcome.url;
}

describe("login landing page", () => {
  beforeEach(() => {
    // The limiter is keyed on IP *and* identifier and cleared on success, but
    // these tests share one IP — a stray failure must not leak into the next.
    vi.resetModules();
  });

  it("sends a superadmin to the admin panel", async () => {
    const admin = await factories.user({ email: "boss@example.test", role: "superadmin" });

    expect(await landsOn({ identifier: admin.email })).toBe("/admin");
  });

  it("sends staff and admins to the admin panel too", async () => {
    const staff = await factories.user({ email: "staff@example.test", role: "staff" });
    const admin = await factories.user({ email: "admin@example.test", role: "admin" });

    expect(await landsOn({ identifier: staff.email })).toBe("/admin");
    expect(await landsOn({ identifier: admin.email })).toBe("/admin");
  });

  it("leaves a player on the lobby", async () => {
    const player = await factories.user({ email: "player@example.test", role: "user" });

    expect(await landsOn({ identifier: player.email })).toBe("/");
  });

  it("resolves the role from a username, not just an email", async () => {
    const admin = await factories.user({ username: "chief", role: "superadmin" });

    expect(await landsOn({ identifier: admin.username })).toBe("/admin");
  });

  it("honours an explicit callbackUrl over the role's default", async () => {
    const admin = await factories.user({ email: "boss2@example.test", role: "superadmin" });
    const player = await factories.user({ email: "player2@example.test", role: "user" });

    // The proxy sets this when it bounces someone off the page they asked for;
    // it has to survive, or a deep link into /wallet always loses to /admin.
    expect(await landsOn({ identifier: admin.email, callbackUrl: "/wallet" })).toBe("/wallet");
    expect(await landsOn({ identifier: player.email, callbackUrl: "/my-bets" })).toBe("/my-bets");
  });

  it("still refuses an off-site callbackUrl", async () => {
    const admin = await factories.user({ email: "boss3@example.test", role: "superadmin" });

    // `//evil.com` is a protocol-relative URL, not a path. It falls back to the
    // lobby rather than to /admin — safeCallbackUrl's answer is what is unsafe,
    // so it is the whole hint, and a rejected one means "no hint given".
    expect(await landsOn({ identifier: admin.email, callbackUrl: "//evil.com" })).toBe("/admin");
    expect(await landsOn({ identifier: admin.email, callbackUrl: "https://evil.com" })).toBe(
      "/admin",
    );
  });
});
