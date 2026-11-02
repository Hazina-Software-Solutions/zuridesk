import type { IndexDirection } from "../indexes/index-policy";
import {
  tenantIdentityCollectionNames,
  tenantIdentityDocumentShapeV1,
  tenantIdentityIndexManifest
} from "./0001-tenant-identity-manifest";
import type { Migration } from "./types";

export const tenantIdentityChecksumMaterial = JSON.stringify({
  schemaVersion: 1,
  collections: tenantIdentityCollectionNames,
  documentShape: tenantIdentityDocumentShapeV1,
  indexes: tenantIdentityIndexManifest
});

function keyDocument(keys: readonly (readonly [string, IndexDirection])[]): Record<string, 1 | -1> {
  return Object.fromEntries(keys) as Record<string, 1 | -1>;
}

export const createTenantIdentityCollectionsMigration: Migration = {
  id: "0001_create_tenant_identity_collections",
  name: "Create tenant identity collections and indexes",
  checksumMaterial: tenantIdentityChecksumMaterial,
  async up({ database }) {
    const existingCollections = new Set(
      (await database.listCollections({}, { nameOnly: true }).toArray()).map(
        (collection) => collection.name
      )
    );

    for (const collectionName of tenantIdentityCollectionNames) {
      if (!existingCollections.has(collectionName)) {
        await database.createCollection(collectionName);
      }
    }

    for (const index of tenantIdentityIndexManifest) {
      if (index.kind === "system") continue;
      await database.collection(index.collection).createIndex(keyDocument(index.keys), {
        name: index.name,
        ...(index.kind === "unique" ? { unique: true } : {}),
        ...(index.kind === "ttl" ? { expireAfterSeconds: index.expireAfterSeconds } : {})
      });
    }
  }
};
