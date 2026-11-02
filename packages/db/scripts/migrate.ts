import { connectDatabase, disconnectDatabase, getInternalDatabase } from "../src/connection";
import { migrations } from "../src/migrations/registry";
import { runMigrations } from "../src/migrations/runner";

function requiredEnvironment(name: "MONGODB_URI" | "MONGODB_DB_NAME"): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

try {
  await connectDatabase({
    uri: requiredEnvironment("MONGODB_URI"),
    databaseName: requiredEnvironment("MONGODB_DB_NAME")
  });
  const result = await runMigrations(getInternalDatabase(), migrations);
  console.log(`Applied migrations: ${result.applied.join(", ") || "none"}`);
  console.log(`Already applied: ${result.skipped.join(", ") || "none"}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration failed");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
