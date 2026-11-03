import { randomUUID } from "node:crypto";

import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectDatabase, disconnectDatabase, getInternalDatabase } from "../connection";
import { migrations } from "../migrations/registry";
import { runMigrations } from "../migrations/runner";
import {
  DEVELOPMENT_DEMO_IDS,
  DEVELOPMENT_DEMO_PERSONAS,
  seedDevelopmentDemoFixtures,
  type DevelopmentDemoPasswordHashes
} from "./development-demo";

const uri = process.env.TEST_MONGODB_URI;
const databaseName = `zuridesk_test_demo_seed_${randomUUID().replaceAll("-", "")}`;

function hashes(version: string): DevelopmentDemoPasswordHashes {
  return {
    owner: `$argon2id$${version}-owner`,
    manager: `$argon2id$${version}-manager`,
    receptionist: `$argon2id$${version}-receptionist`,
    stylistA: `$argon2id$${version}-stylist-a`,
    stylistB: `$argon2id$${version}-stylist-b`
  };
}

describe.skipIf(uri === undefined)("development demo seed", () => {
  beforeAll(async () => {
    await connectDatabase({ uri: uri!, databaseName });
    await runMigrations(getInternalDatabase(), migrations);
  });

  afterAll(async () => {
    await getInternalDatabase().dropDatabase();
    await disconnectDatabase();
  });

  it("converges reusable personas, permissions, catalogue and dynamic schedules", async () => {
    const expected = {
      datasetVersion: 1,
      tenants: 1,
      locations: 1,
      users: 5,
      memberships: 5,
      services: 3,
      staffProfiles: 2,
      offerings: 3
    };
    await expect(seedDevelopmentDemoFixtures({ passwordHashes: hashes("v1") })).resolves.toEqual(
      expected
    );

    const database = getInternalDatabase();
    const demoEmails = DEVELOPMENT_DEMO_PERSONAS.map(({ email }) => email);
    expect(
      await database.collection("auth_identities").countDocuments({
        normalizedEmail: { $in: demoEmails }
      })
    ).toBe(5);
    expect(
      await database.collection("memberships").countDocuments({
        tenantId: DEVELOPMENT_DEMO_IDS.tenant,
        status: "active"
      })
    ).toBe(5);
    expect(
      await database.collection("location_access_grants").countDocuments({
        tenantId: DEVELOPMENT_DEMO_IDS.tenant,
        locationId: DEVELOPMENT_DEMO_IDS.location,
        status: "active"
      })
    ).toBe(2);
    expect(
      await database.collection("service_location_offerings").countDocuments({
        tenantId: DEVELOPMENT_DEMO_IDS.tenant,
        status: "active"
      })
    ).toBe(3);

    const profiles = await database
      .collection<{ scheduleMode: string }>("staff_booking_profiles")
      .find({ tenantId: DEVELOPMENT_DEMO_IDS.tenant })
      .sort({ displayName: 1 })
      .toArray();
    expect(profiles.map(({ scheduleMode }) => scheduleMode)).toEqual([
      "inherit_location",
      "custom"
    ]);

    const customSchedule = await database
      .collection<{
        week: { intervals: { startMinute: number; endMinute: number }[] }[];
      }>("weekly_schedule_versions")
      .findOne({ _id: DEVELOPMENT_DEMO_IDS.schedules.stylistB });
    expect(customSchedule?.week[1]?.intervals).toEqual([
      { startMinute: 540, endMinute: 780 },
      { startMinute: 840, endMinute: 1_020 }
    ]);

    const demoSessionId = new Types.ObjectId();
    await database.collection("auth_sessions").insertOne({
      _id: demoSessionId,
      schemaVersion: 1,
      userId: DEVELOPMENT_DEMO_IDS.users.owner,
      familyId: randomUUID(),
      currentRefreshDigest: "a".repeat(64),
      csrfDigest: "b".repeat(64),
      transport: "web",
      activeTenantId: DEVELOPMENT_DEMO_IDS.tenant,
      idleExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
      absoluteExpiresAt: new Date("2099-01-02T00:00:00.000Z"),
      lastUsedAt: new Date("2026-01-01T00:00:00.000Z"),
      revokedAt: null,
      reuseDetectedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    });
    await database.collection("refresh_token_history").insertOne({
      schemaVersion: 1,
      sessionId: demoSessionId,
      familyId: randomUUID(),
      tokenDigest: "c".repeat(64),
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    });

    await expect(seedDevelopmentDemoFixtures({ passwordHashes: hashes("v2") })).resolves.toEqual(
      expected
    );
    expect(
      await database.collection("auth_sessions").countDocuments({
        userId: DEVELOPMENT_DEMO_IDS.users.owner
      })
    ).toBe(0);
    expect(
      await database
        .collection("refresh_token_history")
        .countDocuments({ sessionId: demoSessionId })
    ).toBe(0);
    const ownerIdentity = await database.collection("auth_identities").findOne({
      normalizedEmail: "owner@demo.zuridesk.example"
    });
    expect(ownerIdentity?.passwordHash).toBe("$argon2id$v2-owner");
  });
});
