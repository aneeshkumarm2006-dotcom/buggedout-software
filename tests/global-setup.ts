import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { TestProject } from "vitest/node";

/**
 * Brings up the database the whole run shares.
 *
 * A single-node **replica set**, not a standalone `mongod`: the wallet service
 * and settlement both take a different code path when the deployment supports
 * multi-document transactions, and Atlas does. A standalone would silently
 * exercise only the compensating fallback and report green while the path that
 * actually ships went untested.
 *
 * `MONGODB_TEST_URI` short-circuits the whole thing — point it at a real
 * replica set (CI service container, a scratch Atlas cluster) and no binary is
 * downloaded.
 */
declare module "vitest" {
  interface ProvidedContext {
    mongoUri: string;
  }
}

export default async function setup(project: TestProject) {
  const external = process.env.MONGODB_TEST_URI;

  if (external) {
    project.provide("mongoUri", external);
    return;
  }

  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });

  project.provide("mongoUri", replSet.getUri("buggedout_test"));

  return async () => {
    await replSet.stop();
  };
}
