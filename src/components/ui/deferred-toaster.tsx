"use client";

import dynamic from "next/dynamic";

/**
 * The app's toaster, loaded after hydration (9.5).
 *
 * Sonner sat in the root layout, so its implementation was part of the first
 * script on every route — including the two this phase measures, where nothing
 * can raise a toast until the user has interacted. Nothing here is visible
 * until something calls `toast()`, so there is no layout to preserve and
 * `ssr: false` costs nothing.
 *
 * A client wrapper because `next/dynamic` with `ssr: false` cannot be called
 * from a Server Component, and the root layout is one.
 */
const Toaster = dynamic(() => import("@/components/ui/sonner").then((mod) => mod.Toaster), {
  ssr: false,
});

export function DeferredToaster() {
  return <Toaster position="top-center" richColors />;
}
