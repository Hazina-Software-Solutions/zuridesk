import type { Migration } from "./types";
import { createTenantIdentityCollectionsMigration } from "./0001-create-tenant-identity-collections";

export const migrations = [
  createTenantIdentityCollectionsMigration
] as const satisfies readonly Migration[];
