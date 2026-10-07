import { createHash } from "node:crypto";

import type { Migration } from "./types";

export function checksumMigration(migration: Migration): string {
  return createHash("sha256")
    .update(migration.id)
    .update("\0")
    .update(migration.name)
    .update("\0")
    .update(migration.up.toString())
    .digest("hex");
}
