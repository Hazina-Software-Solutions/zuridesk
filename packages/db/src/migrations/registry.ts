import type { Migration } from "./types";
import { createTenantIdentityCollectionsMigration } from "./0001-create-tenant-identity-collections";
import { addAuthTenancyRbacMigration } from "./0002-add-auth-tenancy-rbac";
import { addBookingDomainFoundationMigration } from "./0003-add-booking-domain-foundation";

export const migrations = [
  createTenantIdentityCollectionsMigration,
  addAuthTenancyRbacMigration,
  addBookingDomainFoundationMigration
] as const satisfies readonly Migration[];
