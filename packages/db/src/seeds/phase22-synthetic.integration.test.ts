import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Types } from "mongoose";

import { connectDatabase, disconnectDatabase, getInternalDatabase } from "../connection";
import { migrations } from "../migrations/registry";
import { runMigrations } from "../migrations/runner";
import { seedPhase22SyntheticFixtures } from "./phase22-synthetic";

const uri = process.env.TEST_MONGODB_URI;
const databaseName = `zuridesk_test_seed_${randomUUID().replaceAll("-", "")}`;

describe.skipIf(uri === undefined)("Phase 2.2 synthetic seed", () => {
  beforeAll(async () => {
    await connectDatabase({ uri: uri!, databaseName });
    await runMigrations(getInternalDatabase(), migrations);
  });

  afterAll(async () => {
    await getInternalDatabase().dropDatabase();
    await disconnectDatabase();
  });

  it("is idempotent and creates isolated two-tenant fixtures with one shared user", async () => {
    const expected = { tenants: 2, locations: 2, users: 1, memberships: 2, invites: 2 };
    await expect(seedPhase22SyntheticFixtures()).resolves.toEqual(expected);
    await expect(seedPhase22SyntheticFixtures()).resolves.toEqual(expected);

    const database = getInternalDatabase();
    const memberships = await database
      .collection<{ tenantId: Types.ObjectId; userId: Types.ObjectId }>("memberships")
      .find({})
      .toArray();
    expect(new Set(memberships.map(({ tenantId }) => tenantId.toHexString())).size).toBe(2);
    expect(new Set(memberships.map(({ userId }) => userId.toHexString())).size).toBe(1);

    const invites = await database
      .collection<{
        tokenDigest: string;
        token?: string;
        secret?: string;
        recipient: { value: string };
      }>("invites")
      .find({})
      .toArray();
    expect(invites).toHaveLength(2);
    for (const invite of invites) {
      expect(invite.tokenDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(invite.token).toBeUndefined();
      expect(invite.secret).toBeUndefined();
      expect(invite.recipient.value).toMatch(/\.example$/);
    }
  });
});
