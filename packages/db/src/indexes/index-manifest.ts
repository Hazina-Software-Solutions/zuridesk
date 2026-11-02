import { tenantIdentityIndexManifest } from "../migrations/0001-tenant-identity-manifest";
import type { ApplicationIndexDefinition } from "./index-policy";

export const migrationIndexManifest = [
  {
    collection: "schema_migrations",
    name: "migration_id_unique",
    tenantOwned: false,
    kind: "unique",
    keys: [["migrationId", 1]]
  }
] as const satisfies readonly ApplicationIndexDefinition[];

export const businessIndexManifest = tenantIdentityIndexManifest;

export const applicationIndexManifest = [
  ...migrationIndexManifest,
  ...businessIndexManifest
] as const satisfies readonly ApplicationIndexDefinition[];
