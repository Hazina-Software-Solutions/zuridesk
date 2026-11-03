import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { connectDatabase, disconnectDatabase, getInternalDatabase } from "../connection";
import { addBookingDomainFoundationMigration } from "./0003-add-booking-domain-foundation";
import { phase41CollectionNames, phase41IndexManifest } from "./0003-booking-foundation-manifest";
import { migrations } from "./registry";
import { runMigrations } from "./runner";

const uri = process.env.TEST_MONGODB_URI;
const databaseName = `zuridesk_test_phase41_mig_${randomUUID().replaceAll("-", "")}`;

describe.skipIf(uri === undefined)("Phase 4.1 forward migration", () => {
  beforeAll(async () => {
    await connectDatabase({ uri: uri!, databaseName });
  });

  beforeEach(async () => {
    await getInternalDatabase().dropDatabase();
    await runMigrations(getInternalDatabase(), migrations.slice(0, 2));
  });

  afterAll(async () => {
    await getInternalDatabase().dropDatabase();
    await disconnectDatabase();
  });

  it.each([
    [{ name: "malformed row" }],
    [{ tenantId: "tenant-a", name: "well-formed but unsupported row" }],
    [
      { tenantId: "tenant-a", name: "first unsupported row" },
      { tenantId: "tenant-a", name: "duplicate unsupported row" }
    ]
  ])("rejects every pre-existing Phase 4 row before any mutation (%j)", async (...rows) => {
    const database = getInternalDatabase();
    await database.createCollection("services");
    await database.collection("services").insertMany(rows);

    await expect(addBookingDomainFoundationMigration.up({ database })).rejects.toThrow(
      `services=${rows.length}`
    );
    expect(
      await database
        .listCollections({ name: "staff_booking_profiles" }, { nameOnly: true })
        .hasNext()
    ).toBe(false);
    expect((await database.collection("services").indexes()).map(({ name }) => name)).toEqual([
      "_id_"
    ]);
  });

  it("creates empty structures, validates full index specifications, and reruns idempotently", async () => {
    const database = getInternalDatabase();
    await expect(runMigrations(database, migrations)).resolves.toEqual({
      applied: ["0003_add_booking_domain_foundation"],
      skipped: ["0001_create_tenant_identity_collections", "0002_add_auth_tenancy_rbac"]
    });
    for (const collection of phase41CollectionNames) {
      expect(await database.collection(collection).countDocuments()).toBe(0);
      const actualIndexes = await database.collection(collection).indexes();
      for (const expected of phase41IndexManifest.filter(
        (index) => index.collection === collection
      )) {
        const actual = actualIndexes.find(({ name }) => name === expected.name);
        expect(actual, `${collection}.${expected.name}`).toBeDefined();
        expect(Object.entries(actual!.key)).toEqual(
          expected.keys.map(([field, value]) => [field, value])
        );
        if (expected.kind !== "system") {
          expect(Boolean(actual!.unique)).toBe(expected.kind === "unique");
        }
        expect(actual!.partialFilterExpression).toEqual(
          "partialFilterExpression" in expected ? expected.partialFilterExpression : undefined
        );
      }
    }

    await expect(addBookingDomainFoundationMigration.up({ database })).resolves.toBeUndefined();
  });

  it("rejects a conflicting index definition instead of accepting a matching name", async () => {
    const database = getInternalDatabase();
    await database.createCollection("services");
    await database
      .collection("services")
      .createIndex({ tenantId: 1, name: -1 }, { name: "tenant_status_name" });
    await expect(addBookingDomainFoundationMigration.up({ database })).rejects.toThrow();
    expect(
      await database
        .listCollections({ name: "staff_booking_profiles" }, { nameOnly: true })
        .hasNext()
    ).toBe(true);
  });
});
