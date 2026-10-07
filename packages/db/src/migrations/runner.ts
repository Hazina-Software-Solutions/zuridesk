import { assertValidIndexManifest } from "../indexes/index-policy";
import { migrationIndexManifest } from "../indexes/index-manifest";
import { checksumMigration } from "./checksum";
import type {
  AppliedMigrationRecord,
  Migration,
  MigrationDatabase,
  MigrationStatusEntry
} from "./types";

const migrationIdPattern = /^\d{4}_[a-z0-9]+(?:_[a-z0-9]+)*$/;
const migrationCollectionName = "schema_migrations";

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

function validateRegistry(migrations: readonly Migration[]): void {
  const ids = new Set<string>();
  let previousId: string | undefined;

  for (const migration of migrations) {
    if (!migrationIdPattern.test(migration.id)) {
      throw new MigrationError(
        `Migration ID ${migration.id} must match NNNN_lowercase_description`
      );
    }
    if (migration.name.trim().length === 0) {
      throw new MigrationError(`Migration ${migration.id} must have a name`);
    }
    if (ids.has(migration.id)) {
      throw new MigrationError(`Duplicate migration ID ${migration.id}`);
    }
    if (previousId !== undefined && migration.id <= previousId) {
      throw new MigrationError("Migrations must be registered in ascending ID order");
    }

    ids.add(migration.id);
    previousId = migration.id;
  }
}

async function ensureMigrationStore(database: MigrationDatabase): Promise<void> {
  assertValidIndexManifest(migrationIndexManifest);

  const index = migrationIndexManifest[0];
  await database
    .collection<AppliedMigrationRecord>(migrationCollectionName)
    .createIndex({ migrationId: 1 }, { name: index.name, unique: true });
}

async function readAppliedMigrations(
  database: MigrationDatabase
): Promise<Map<string, AppliedMigrationRecord>> {
  const records = await database
    .collection<AppliedMigrationRecord>(migrationCollectionName)
    .find({})
    .sort({ migrationId: 1 })
    .toArray();

  return new Map(records.map((record) => [record.migrationId, record]));
}

function assertAppliedChecksums(
  migrations: readonly Migration[],
  applied: ReadonlyMap<string, AppliedMigrationRecord>
): void {
  const registeredIds = new Set(migrations.map((migration) => migration.id));

  for (const migrationId of applied.keys()) {
    if (!registeredIds.has(migrationId)) {
      throw new MigrationError(
        `Database contains unregistered migration ${migrationId}; restore its immutable definition`
      );
    }
  }

  for (const migration of migrations) {
    const record = applied.get(migration.id);
    if (record !== undefined && record.checksum !== checksumMigration(migration)) {
      throw new MigrationError(
        `Applied migration ${migration.id} has changed; create a new forward migration instead`
      );
    }
  }
}

export async function getMigrationStatus(
  database: MigrationDatabase,
  registry: readonly Migration[]
): Promise<readonly MigrationStatusEntry[]> {
  validateRegistry(registry);
  await ensureMigrationStore(database);
  const applied = await readAppliedMigrations(database);
  assertAppliedChecksums(registry, applied);

  return registry.map((migration) => {
    const record = applied.get(migration.id);
    const base = {
      id: migration.id,
      name: migration.name,
      checksum: checksumMigration(migration)
    };

    return record === undefined
      ? { ...base, state: "pending" as const }
      : { ...base, state: "applied" as const, appliedAt: record.appliedAt };
  });
}

export interface RunMigrationsResult {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

export async function runMigrations(
  database: MigrationDatabase,
  registry: readonly Migration[]
): Promise<RunMigrationsResult> {
  validateRegistry(registry);
  await ensureMigrationStore(database);
  const appliedRecords = await readAppliedMigrations(database);
  assertAppliedChecksums(registry, appliedRecords);

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of registry) {
    if (appliedRecords.has(migration.id)) {
      skipped.push(migration.id);
      continue;
    }

    const startedAt = Date.now();
    await migration.up({ database });

    await database.collection<AppliedMigrationRecord>(migrationCollectionName).insertOne({
      migrationId: migration.id,
      name: migration.name,
      checksum: checksumMigration(migration),
      appliedAt: new Date(),
      durationMs: Date.now() - startedAt,
      runnerVersion: 1
    });
    applied.push(migration.id);
  }

  return { applied, skipped };
}
