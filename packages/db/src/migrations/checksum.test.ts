import { describe, expect, it } from "vitest";

import { checksumMigration } from "./checksum";
import type { Migration } from "./types";

describe("migration checksum", () => {
  it("includes immutable migration-owned schema and index material", () => {
    const migration: Migration = {
      id: "0001_test",
      name: "Test",
      checksumMaterial: "schema-v1",
      async up() {}
    };
    expect(checksumMigration(migration)).not.toBe(
      checksumMigration({ ...migration, checksumMaterial: "schema-v2" })
    );
  });
});
