import { connectDatabase, disconnectDatabase, getInternalDatabase } from "../src/connection";
import { migrations } from "../src/migrations/registry";
import { getMigrationStatus } from "../src/migrations/runner";
import {
  assertSyntheticSeedAllowed,
  seedPhase22SyntheticFixtures
} from "../src/seeds/phase22-synthetic";

function requiredEnvironment(name: "MONGODB_URI" | "MONGODB_DB_NAME"): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

try {
  assertSyntheticSeedAllowed(process.env);
  await connectDatabase({
    uri: requiredEnvironment("MONGODB_URI"),
    databaseName: requiredEnvironment("MONGODB_DB_NAME")
  });
  const migrationStatus = await getMigrationStatus(getInternalDatabase(), migrations);
  const pendingMigrations = migrationStatus.filter(({ state }) => state === "pending");
  if (pendingMigrations.length > 0) {
    throw new Error("Apply every registered migration before running the synthetic seed");
  }
  const counts = await seedPhase22SyntheticFixtures();
  console.log(
    `Synthetic fixture counts: tenants=${counts.tenants} locations=${counts.locations} users=${counts.users} memberships=${counts.memberships} invites=${counts.invites}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Synthetic seed failed");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
