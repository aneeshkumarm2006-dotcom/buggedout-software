import "server-only";

import mongoose, { type Mongoose } from "mongoose";

import { env } from "@/lib/env";

/**
 * Serverless-safe Mongoose connection.
 *
 * Every serverless invocation re-evaluates module scope but reuses the same
 * Node process, so the connection (and the in-flight promise) is parked on
 * `globalThis` to avoid opening a new pool per request and exhausting Atlas
 * connection limits.
 */
type MongooseCache = {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  __mongooseCache?: MongooseCache;
};

const cache: MongooseCache = (globalForMongoose.__mongooseCache ??= {
  conn: null,
  promise: null,
});

export async function connectDB(): Promise<Mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose.connect(env.MONGODB_URI, {
      // Fail fast instead of silently queueing operations when the pool is down.
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    });
  }

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    // Clear the rejected promise so the next call retries instead of
    // replaying the same failure forever.
    cache.promise = null;
    throw error;
  }

  return cache.conn;
}

export async function disconnectDB(): Promise<void> {
  if (!cache.conn) return;
  await mongoose.disconnect();
  cache.conn = null;
  cache.promise = null;
}
