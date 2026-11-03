import type { IndexDirection } from "../indexes/index-policy";
import {
  phase41CollectionNames,
  phase41DocumentShape,
  phase41IndexManifest
} from "./0003-booking-foundation-manifest";
import type { Migration } from "./types";

export const phase41ChecksumMaterial = JSON.stringify({
  schemaVersion: 1,
  collections: phase41CollectionNames,
  documentShape: phase41DocumentShape,
  indexes: phase41IndexManifest,
  backfill: "none-fail-closed-no-fabricated-hours-staff-guests-or-bookings"
});

function keyDocument(keys: readonly (readonly [string, IndexDirection])[]): Record<string, 1 | -1> {
  return Object.fromEntries(keys) as Record<string, 1 | -1>;
}

export const addBookingDomainFoundationMigration: Migration = {
  id: "0003_add_booking_domain_foundation",
  name: "Add dynamic booking domain foundation",
  checksumMaterial: phase41ChecksumMaterial,
  async up({ database }) {
    // Preflight is intentionally read-only. Phase 4.1 has no legacy source from
    // which hours, staff eligibility or guest data could be safely inferred.
    const unexpectedOwnedRows = await Promise.all(
      phase41CollectionNames.map(async (collection) => {
        const exists = await database
          .listCollections({ name: collection }, { nameOnly: true })
          .hasNext();
        return {
          collection,
          count: exists ? await database.collection(collection).countDocuments({}) : 0
        };
      })
    );
    const populatedCollections = unexpectedOwnedRows.filter(({ count }) => count > 0);
    if (populatedCollections.length > 0) {
      throw new Error(
        `Phase 4.1 preflight failed: unexpected pre-existing rows (${populatedCollections
          .map(({ collection, count }) => `${collection}=${count}`)
          .join(", ")})`
      );
    }

    const existing = new Set(
      (await database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name)
    );
    for (const collection of phase41CollectionNames) {
      if (!existing.has(collection)) await database.createCollection(collection);
    }
    for (const index of phase41IndexManifest) {
      if (index.kind === "system") continue;
      await database.collection(index.collection).createIndex(keyDocument(index.keys), {
        name: index.name,
        unique: index.kind === "unique",
        ...("partialFilterExpression" in index
          ? { partialFilterExpression: index.partialFilterExpression }
          : {})
      });
    }

    const absent = [];
    const invalidIndexes = [];
    for (const collection of phase41CollectionNames) {
      if (!(await database.listCollections({ name: collection }, { nameOnly: true }).hasNext())) {
        absent.push(collection);
        continue;
      }
      const actualIndexes = await database.collection(collection).indexes();
      for (const expected of phase41IndexManifest.filter(
        (index) => index.collection === collection
      )) {
        const actual = actualIndexes.find(({ name }) => name === expected.name);
        const label = `${collection}.${expected.name}`;
        if (actual === undefined) {
          invalidIndexes.push(`${label}: missing`);
          continue;
        }
        const expectedKeys = expected.keys.map(([field, direction]) => [field, direction]);
        const actualKeys = Object.entries(actual.key);
        if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
          invalidIndexes.push(`${label}: key definition mismatch`);
        }
        if (expected.kind !== "system" && Boolean(actual.unique) !== (expected.kind === "unique")) {
          invalidIndexes.push(`${label}: unique option mismatch`);
        }
        const expectedPartial =
          "partialFilterExpression" in expected ? expected.partialFilterExpression : undefined;
        if (JSON.stringify(actual.partialFilterExpression) !== JSON.stringify(expectedPartial)) {
          invalidIndexes.push(`${label}: partial filter mismatch`);
        }
      }
    }
    if (absent.length > 0) throw new Error(`Phase 4.1 postflight failed: ${absent.join(", ")}`);
    if (invalidIndexes.length > 0) {
      throw new Error(`Phase 4.1 index postflight failed: ${invalidIndexes.join(", ")}`);
    }
  }
};
