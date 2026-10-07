import type { Connection } from "mongoose";

export type MigrationDatabase = NonNullable<Connection["db"]>;

export interface MigrationContext {
  database: MigrationDatabase;
}

export interface Migration {
  /** Ordered, immutable identifier such as 0001_create_tenants. */
  id: string;
  name: string;
  /** Must be safe to run again after an interrupted deployment. */
  up(context: MigrationContext): Promise<void>;
}

export interface AppliedMigrationRecord {
  migrationId: string;
  name: string;
  checksum: string;
  appliedAt: Date;
  durationMs: number;
  runnerVersion: 1;
}

export interface MigrationStatusEntry {
  id: string;
  name: string;
  checksum: string;
  state: "applied" | "pending";
  appliedAt?: Date;
}
