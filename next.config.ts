import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * `radix-ui` is the umbrella package — every shadcn component here imports
     * a primitive off it (`import { Dialog } from "radix-ui"`), which drags the
     * whole barrel into the module graph and then relies on tree-shaking to get
     * back out. Next optimizes a list of such packages by default and this one
     * is not on it (9.5). The alternative is rewriting thirteen files to deep
     * paths and remembering to keep doing so.
     */
    optimizePackageImports: ["radix-ui"],
  },

  /*
   * `experimental.inlineCss` was tried here and removed: inlining the 17KB
   * stylesheet into every document to save a round trip made first paint
   * *worse* on the measured runs (FCP 0.99s → 1.19s), because the extra bytes
   * land on the critical document itself. Recorded so it isn't tried twice.
   */
};

export default nextConfig;
