import mongoose from "mongoose";
import { afterAll, beforeEach, inject } from "vitest";

/**
 * Per-worker setup.
 *
 * The environment has to be in place *before* any app module loads, because
 * `src/lib/env.ts` parses `process.env` at import time and throws on anything
 * missing. Setup files run before the test file's own imports are evaluated,
 * so these assignments win — which is also why nothing from `@/` may be
 * statically imported here: the import would be hoisted above them. App modules
 * are pulled in with `await import(…)` inside the hooks instead.
 */
process.env.MONGODB_URI = inject("mongoUri");
process.env.AUTH_SECRET ??= "test-auth-secret-not-used-for-signing-anything-real";
process.env.AUTH_TRUST_HOST ??= "true";
// Pinned rather than inherited: the wallet tests assert on these exact numbers.
process.env.SIGNUP_BONUS_COINS = "1000";
process.env.DAILY_BONUS_COINS = "100";

/**
 * A clean database per test. `deleteMany` on the raw driver collection, not
 * through the models — Transaction and AuditLog are append-only and their
 * Mongoose pre-hooks reject `deleteMany` by design (Phase 2).
 */
beforeEach(async () => {
  const { connectDB } = await import("@/lib/db");
  await connectDB();

  const db = mongoose.connection.db;
  if (!db) throw new Error("No database handle after connectDB()");

  const collections = await db.listCollections({}, { nameOnly: true }).toArray();

  await Promise.all(
    collections
      .filter((collection) => !collection.name.startsWith("system."))
      .map((collection) => db.collection(collection.name).deleteMany({})),
  );
});

afterAll(async () => {
  const { disconnectDB } = await import("@/lib/db");
  await disconnectDB();
});
