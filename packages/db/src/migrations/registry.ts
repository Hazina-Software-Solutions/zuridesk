import type { Migration } from "./types";
import { createTenantIdentityCollectionsMigration } from "./0001-create-tenant-identity-collections";
import { addAuthTenancyRbacMigration } from "./0002-add-auth-tenancy-rbac";

export const migrations = [
  createTenantIdentityCollectionsMigration,
  addAuthTenancyRbacMigration
] as const satisfies readonly Migration[];
