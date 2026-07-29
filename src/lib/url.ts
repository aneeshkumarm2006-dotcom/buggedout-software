import "server-only";

import { headers } from "next/headers";

/**
 * Origin of the current request (`https://buggedout.com`, `http://localhost:3000`).
 * Used to build absolute links for emails, which have no request context of
 * their own. `AUTH_URL` wins when set, since a cron/CLI invocation has no
 * incoming headers to read.
 */
export async function getBaseUrl(): Promise<string> {
  const configured = process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}
