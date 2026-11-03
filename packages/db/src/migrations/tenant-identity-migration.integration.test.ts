import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectDatabase, disconnectDatabase, getInternalDatabase } from "../connection";
import { businessIndexManifest } from "../indexes/index-manifest";
import { assertValidIndexManifest } from "../indexes/index-policy";
import { migrations } from "./registry";
import { runMigrations } from "./runner";

const uri = process.env.TEST_MONGODB_URI;
const databaseName = `zuridesk_test_mig_${randomUUID().replaceAll("-", "")}`;

describe.skipIf(uri === undefined)("tenant identity migration", () => {
  beforeAll(async () => {
    await connectDatabase({ uri: uri!, databaseName });
  });

  afterAll(async () => {
    await getInternalDatabase().dropDatabase();
    await disconnectDatabase();
  });

  it("recovers from partial collection/index creation and is idempotent", async () => {
    const database = getInternalDatabase();
    await database.createCollection("tenants");
    await database.createCollection("locations");
    await database
      .collection("locations")
      .createIndex(
        { tenantId: 1, deletedAt: 1, status: 1, name: 1, _id: 1 },
        { name: "tenant_location_list" }
      );

    await expect(runMigrations(database, migrations)).resolves.toEqual({
      applied: ["0001_create_tenant_identity_collections", "0002_add_auth_tenancy_rbac"],
      skipped: []
    });
    await expect(runMigrations(database, migrations)).resolves.toEqual({
      applied: [],
      skipped: ["0001_create_tenant_identity_collections", "0002_add_auth_tenancy_rbac"]
    });

    const collections = new Set(
      (await database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name)
    );
    for (const expected of [
      "tenants",
      "users",
      "locations",
      "memberships",
      "invites",
      "auth_identities",
      "auth_sessions",
      "refresh_token_history",
      "auth_challenges",
      "rate_limit_buckets",
      "user_tenant_directory",
      "security_events",
      "tenant_audit_logs"
    ]) {
      expect(collections.has(expected)).toBe(true);
    }
  });

  it("matches every live business index name, key, and relevant option to the manifest", async () => {
    const database = getInternalDatabase();
    assertValidIndexManifest(businessIndexManifest);

    for (const collectionName of [
      ...new Set(businessIndexManifest.map(({ collection }) => collection))
    ]) {
      const expected = businessIndexManifest.filter((index) => index.collection === collectionName);
      const actual = await database.collection(collectionName).indexes();
      expect(actual.map((index) => index.name).sort()).toEqual(
        expected.map((index) => index.name).sort()
      );

      for (const index of expected) {
        const live = actual.find((candidate) => candidate.name === index.name);
        expect(live).toBeDefined();
        expect(Object.entries(live!.key)).toEqual(index.keys);
        expect(live!.unique ?? false).toBe(index.kind === "unique");
        if (index.kind === "ttl") {
          expect(live!.expireAfterSeconds).toBe(index.expireAfterSeconds);
        } else {
          expect(live!.expireAfterSeconds).toBeUndefined();
        }
        if ("partialFilterExpression" in index) {
          expect(live!.partialFilterExpression).toEqual(index.partialFilterExpression);
        }
      }
    }
  });
});
