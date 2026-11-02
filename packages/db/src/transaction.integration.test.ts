import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  connectDatabase,
  disconnectDatabase,
  getInternalDatabase,
  getInternalDatabaseConnection
} from "./connection";

const uri = process.env.TEST_MONGODB_URI;
const databaseName = `zuridesk_test_${randomUUID().replaceAll("-", "")}`;

describe.skipIf(uri === undefined)("MongoDB replica-set transactions", () => {
  beforeAll(async () => {
    await connectDatabase({ uri: uri!, databaseName });
  });

  afterAll(async () => {
    await getInternalDatabase().dropDatabase();
    await disconnectDatabase();
  });

  it("commits a transaction", async () => {
    const collection = getInternalDatabase().collection("phase1_transaction_smoke");
    const session = await getInternalDatabaseConnection().startSession();

    try {
      await session.withTransaction(async () => {
        await collection.insertOne({ outcome: "committed" }, { session });
      });
    } finally {
      await session.endSession();
    }

    await expect(collection.countDocuments({ outcome: "committed" })).resolves.toBe(1);
  });

  it("rolls back an aborted transaction", async () => {
    const collection = getInternalDatabase().collection("phase1_transaction_smoke");
    const session = await getInternalDatabaseConnection().startSession();

    try {
      session.startTransaction();
      await collection.insertOne({ outcome: "rolled-back" }, { session });
      await session.abortTransaction();
    } finally {
      await session.endSession();
    }

    await expect(collection.countDocuments({ outcome: "rolled-back" })).resolves.toBe(0);
  });
});
