import { createHash, randomUUID } from "node:crypto";

import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectDatabase, disconnectDatabase, getInternalDatabase } from "../connection";
import { addAuthTenancyRbacMigration } from "./0002-add-auth-tenancy-rbac";
import { migrations } from "./registry";
import { runMigrations } from "./runner";

const uri = process.env.TEST_MONGODB_URI;
const databaseName = `zuridesk_test_phase3_mig_${randomUUID().replaceAll("-", "")}`;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

describe.skipIf(uri === undefined)("Phase 3 forward migration", () => {
  beforeAll(async () => {
    await connectDatabase({ uri: uri!, databaseName });
    await runMigrations(getInternalDatabase(), [migrations[0]]);
  });

  afterAll(async () => {
    await getInternalDatabase().dropDatabase();
    await disconnectDatabase();
  });

  it("preflights without mutation, then deterministically backfills and reruns", async () => {
    const database = getInternalDatabase();
    const tenantId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const now = new Date();
    await database.collection("tenants").insertOne({
      _id: tenantId,
      schemaVersion: 1,
      name: "Legacy",
      defaultLocationId: new Types.ObjectId(),
      status: "active",
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    });
    await database.collection("users").insertOne({
      _id: userId,
      schemaVersion: 1,
      displayName: "Legacy owner",
      status: "active",
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    });
    const membershipId = new Types.ObjectId();
    await database.collection("memberships").insertOne({
      _id: membershipId,
      schemaVersion: 1,
      tenantId,
      userId,
      roleKeys: ["owner"],
      status: "active",
      joinedAt: now,
      revokedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    });
    const recipient = { kind: "email", value: "legacy@example.com" };
    const inserted = await database.collection("invites").insertMany([
      {
        schemaVersion: 1,
        tenantId,
        recipient,
        roleKeys: ["stylist"],
        tokenDigest: digest("old"),
        status: "pending",
        expiresAt: new Date(now.getTime() + 60_000),
        acceptedAt: null,
        revokedAt: null,
        createdAt: new Date(now.getTime() - 1000),
        updatedAt: now
      },
      {
        schemaVersion: 1,
        tenantId,
        recipient: { kind: "email", value: "accepted@example.com" },
        roleKeys: ["stylist"],
        tokenDigest: digest("accepted"),
        status: "accepted",
        expiresAt: new Date(now.getTime() + 60_000),
        acceptedAt: now,
        revokedAt: null,
        createdAt: now,
        updatedAt: now
      },
      {
        schemaVersion: 1,
        tenantId,
        recipient,
        roleKeys: ["stylist"],
        tokenDigest: digest("new"),
        status: "pending",
        expiresAt: new Date(now.getTime() + 60_000),
        acceptedAt: null,
        revokedAt: null,
        createdAt: now,
        updatedAt: now
      },
      {
        schemaVersion: 1,
        tenantId,
        recipient: { kind: "email", value: "expired@example.com" },
        roleKeys: ["stylist"],
        tokenDigest: digest("expired"),
        status: "pending",
        expiresAt: new Date(now.getTime() - 1000),
        acceptedAt: null,
        revokedAt: null,
        createdAt: now,
        updatedAt: now
      }
    ]);

    await expect(addAuthTenancyRbacMigration.up({ database })).rejects.toThrow(
      "acceptedWithoutActor=1; duplicateLivePendingGroups=1"
    );
    expect(await database.collection("tenants").findOne({ _id: tenantId })).not.toHaveProperty(
      "ownerGuardVersion"
    );
    expect(await database.collection("invites").countDocuments({ status: "pending" })).toBe(3);
    const collectionNames = (await database.listCollections({}, { nameOnly: true }).toArray()).map(
      ({ name }) => name
    );
    expect(collectionNames).not.toContain("auth_challenges");

    await database.collection("invites").deleteMany({
      _id: { $in: [inserted.insertedIds[0]!, inserted.insertedIds[1]!] }
    });

    await expect(runMigrations(database, migrations)).resolves.toEqual({
      applied: ["0002_add_auth_tenancy_rbac", "0003_add_booking_domain_foundation"],
      skipped: ["0001_create_tenant_identity_collections"]
    });
    expect(
      await database
        .collection("invites")
        .countDocuments({ status: "pending", "recipient.value": recipient.value })
    ).toBe(1);
    expect(await database.collection("invites").countDocuments({ status: "revoked" })).toBe(1);
    expect(
      await database
        .collection("invites")
        .countDocuments({ schemaVersion: 2, acceptedByUserId: null })
    ).toBe(2);
    expect(await database.collection("tenants").findOne({ _id: tenantId })).toMatchObject({
      ownerGuardVersion: 0
    });
    expect(await database.collection("user_tenant_directory").findOne({ userId })).toMatchObject({
      entries: [{ tenantId, membershipId, roleKeys: ["owner"], status: "active" }]
    });

    await expect(addAuthTenancyRbacMigration.up({ database })).resolves.toBeUndefined();
    expect(
      await database
        .collection("invites")
        .countDocuments({ status: "pending", "recipient.value": recipient.value })
    ).toBe(1);
    const index = (await database.collection("invites").indexes()).find(
      ({ name }) => name === "tenant_recipient_pending_unique"
    );
    expect(index).toMatchObject({ unique: true, partialFilterExpression: { status: "pending" } });
  });
});
