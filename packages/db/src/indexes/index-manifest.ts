import { tenantIdentityIndexManifest } from "../migrations/0001-tenant-identity-manifest";
import { phase3IndexManifest } from "../migrations/0002-auth-tenancy-manifest";
import { phase41IndexManifest } from "../migrations/0003-booking-foundation-manifest";
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

export const businessIndexManifest = [
  ...tenantIdentityIndexManifest,
  ...phase3IndexManifest,
  ...phase41IndexManifest
];

export const applicationIndexManifest = [
  ...migrationIndexManifest,
  ...businessIndexManifest
] as const satisfies readonly ApplicationIndexDefinition[];
