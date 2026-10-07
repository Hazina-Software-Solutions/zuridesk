import { connectDatabase, disconnectDatabase } from "../src/connection";
import { migrations } from "../src/migrations/registry";
import { getMigrationStatus } from "../src/migrations/runner";

function requiredEnvironment(name: "MONGODB_URI" | "MONGODB_DB_NAME"): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

try {
  const connection = await connectDatabase({
    uri: requiredEnvironment("MONGODB_URI"),
    databaseName: requiredEnvironment("MONGODB_DB_NAME")
  });
  const database = connection.db;
  if (database === undefined) {
    throw new Error("MongoDB connection has no selected database");
  }

  const status = await getMigrationStatus(database, migrations);
  if (status.length === 0) {
    console.log("No versioned business-schema migrations are registered yet.");
  } else {
    for (const migration of status) {
      console.log(`${migration.state.padEnd(7)} ${migration.id} ${migration.name}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not read migration status");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
