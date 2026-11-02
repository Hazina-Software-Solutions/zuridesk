import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectDatabase, disconnectDatabase, getInternalDatabase } from "../connection";
import { getMigrationStatus, MigrationError, runMigrations } from "./runner";
import type { Migration } from "./types";

const uri = process.env.TEST_MONGODB_URI;
const databaseName = `zuridesk_migrations_${randomUUID().replaceAll("-", "")}`;

describe.skipIf(uri === undefined)("migration runner", () => {
  const migration: Migration = {
    id: "0001_create_test_records",
    name: "Create integration-test records",
    checksumMaterial: "test-records-v1",
    async up({ database }) {
      await database
        .collection("migration_test_records")
        .updateOne({ key: "created" }, { $setOnInsert: { key: "created" } }, { upsert: true });
    }
  };

  beforeAll(async () => {
    await connectDatabase({ uri: uri!, databaseName });
  });

  afterAll(async () => {
    const database = getInternalDatabase();
    await database.dropDatabase();
    await disconnectDatabase();
  });

  it("applies each migration once and reports status", async () => {
    const database = getInternalDatabase();

    await expect(runMigrations(database, [migration])).resolves.toEqual({
      applied: [migration.id],
      skipped: []
    });
    await expect(runMigrations(database, [migration])).resolves.toEqual({
      applied: [],
      skipped: [migration.id]
    });
    await expect(database.collection("migration_test_records").countDocuments()).resolves.toBe(1);

    const status = await getMigrationStatus(database, [migration]);
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({ id: migration.id, state: "applied" });
    expect(status[0]?.appliedAt).toBeInstanceOf(Date);

    const indexes = await database.collection("schema_migrations").indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "migration_id_unique", unique: true })
      ])
    );
  });

  it("refuses to run an applied migration whose implementation changed", async () => {
    const database = getInternalDatabase();
    await runMigrations(database, [migration]);

    const changedMigration: Migration = {
      ...migration,
      async up({ database }) {
        await database.collection("migration_test_records").insertOne({ key: "changed" });
      }
    };

    await expect(runMigrations(database, [changedMigration])).rejects.toThrow(MigrationError);
  });

  it("refuses to forget an applied migration definition", async () => {
    const database = getInternalDatabase();
    await runMigrations(database, [migration]);

    await expect(getMigrationStatus(database, [])).rejects.toThrow("unregistered migration");
  });

  it("does not record a failed migration as applied", async () => {
    const database = getInternalDatabase();
    await runMigrations(database, [migration]);

    const failingMigration: Migration = {
      id: "0002_failing_test_migration",
      name: "Fail during integration test",
      checksumMaterial: "failing-test-v1",
      up() {
        return Promise.reject(new Error("deliberate migration failure"));
      }
    };

    await expect(runMigrations(database, [migration, failingMigration])).rejects.toThrow(
      "deliberate migration failure"
    );
    await expect(
      database.collection("schema_migrations").countDocuments({ migrationId: failingMigration.id })
    ).resolves.toBe(0);
  });

  it("rejects duplicate, unordered, and malformed migration IDs", async () => {
    const database = getInternalDatabase();

    await expect(runMigrations(database, [migration, migration])).rejects.toThrow(
      "Duplicate migration ID"
    );
    await expect(
      runMigrations(database, [
        { ...migration, id: "0002_second" },
        { ...migration, id: "0001_first" }
      ])
    ).rejects.toThrow("ascending ID order");
    await expect(runMigrations(database, [{ ...migration, id: "bad-id" }])).rejects.toThrow(
      "must match"
    );
  });
});
