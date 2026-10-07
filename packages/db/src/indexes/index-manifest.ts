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
