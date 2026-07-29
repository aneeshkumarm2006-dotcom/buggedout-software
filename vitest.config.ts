import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Test runner for Phase 9.2/9.3.
 *
 * Two aliases do all the work of running app code outside Next:
 *
 *  - `@/…` → `src/…`, the same mapping `tsconfig.json` gives the compiler;
 *  - `server-only` → a no-op. The real package throws unless it is resolved
 *    under the `react-server` condition, which is exactly the guard we want in
 *    the app and exactly what would stop `lib/wallet.ts` loading in a test.
 *
 * Every suite talks to one real MongoDB (a single-node replica set from
 * `mongodb-memory-server`, see `tests/global-setup.ts`) — a replica set rather
 * than a standalone because that is what Atlas is, and it is the only way the
 * transactional paths in the wallet and settlement get exercised at all.
 * `fileParallelism: false` because they share that one database.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
    server: {
      // Externalised packages are loaded by Node, which ignores Vite's aliases —
      // and next-auth's `import "next/server"` only resolves through one.
      deps: { inline: ["next-auth"] },
    },
    // Starting mongod (and bcrypt at cost 12) is slow the first time round.
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${fileURLToPath(new URL("./src", import.meta.url))}/` },
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      },
      {
        // `next/server` has no `exports` entry and Vite will not guess the
        // extension for a bare subpath, so next-auth's `import "next/server"`
        // dies on resolution before any of our code runs.
        find: /^next\/server$/,
        replacement: fileURLToPath(new URL("./node_modules/next/server.js", import.meta.url)),
      },
    ],
  },
});
