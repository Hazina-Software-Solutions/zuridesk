import { connectDatabase, disconnectDatabase } from "@zuridesk/db";
import {
  assertDevelopmentDemoSeedAllowed,
  DEVELOPMENT_DEMO_PERSONAS,
  seedDevelopmentDemoFixtures,
  type DevelopmentDemoPasswordHashes
} from "@zuridesk/db/seeding";
import { passwordSchema } from "@zuridesk/shared";

import { hashPassword } from "../src/auth/crypto";

function requiredEnvironment(name: "MONGODB_URI" | "MONGODB_DB_NAME"): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function demoPassword(): string {
  const value = process.env.ZURIDESK_DEMO_PASSWORD;
  if (value === undefined || value === "replace-with-local-demo-password") {
    throw new Error("Set ZURIDESK_DEMO_PASSWORD to a local-only password before seeding");
  }
  return passwordSchema.parse(value);
}

async function passwordHashes(password: string): Promise<DevelopmentDemoPasswordHashes> {
  const entries: [keyof DevelopmentDemoPasswordHashes, string][] = [];
  for (const persona of DEVELOPMENT_DEMO_PERSONAS) {
    entries.push([persona.key, await hashPassword(password)]);
  }
  return Object.fromEntries(entries) as DevelopmentDemoPasswordHashes;
}

try {
  assertDevelopmentDemoSeedAllowed(process.env);
  const password = demoPassword();
  await connectDatabase({
    uri: requiredEnvironment("MONGODB_URI"),
    databaseName: requiredEnvironment("MONGODB_DB_NAME")
  });
  const result = await seedDevelopmentDemoFixtures({
    passwordHashes: await passwordHashes(password)
  });

  console.log(`Development demo dataset v${result.datasetVersion} is ready.`);
  for (const persona of DEVELOPMENT_DEMO_PERSONAS) {
    console.log(`${persona.key}: ${persona.email} (${persona.roleKeys.join(", ")})`);
  }
  console.log("Password: use the local ZURIDESK_DEMO_PASSWORD value (not printed).");
  console.log(
    `Seeded counts: tenants=${result.tenants} locations=${result.locations} users=${result.users} memberships=${result.memberships} services=${result.services} staffProfiles=${result.staffProfiles} offerings=${result.offerings}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Development demo seed failed");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
