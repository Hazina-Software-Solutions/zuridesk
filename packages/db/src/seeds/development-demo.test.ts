import { describe, expect, it } from "vitest";

import { assertDevelopmentDemoSeedAllowed, seedDevelopmentDemoFixtures } from "./development-demo";

describe("development demo seed safety", () => {
  it("requires explicit opt-in", () => {
    expect(() => assertDevelopmentDemoSeedAllowed({ MONGODB_DB_NAME: "zuridesk_dev" })).toThrow(
      "ZURIDESK_ALLOW_DEMO_SEED"
    );
  });

  it("rejects production and unapproved database names", () => {
    expect(() =>
      assertDevelopmentDemoSeedAllowed({
        ZURIDESK_ALLOW_DEMO_SEED: "true",
        NODE_ENV: "production",
        MONGODB_DB_NAME: "zuridesk_dev"
      })
    ).toThrow("production");
    expect(() =>
      assertDevelopmentDemoSeedAllowed({
        ZURIDESK_ALLOW_DEMO_SEED: "true",
        MONGODB_DB_NAME: "customer_data"
      })
    ).toThrow("approved");
  });

  it("allows deliberate development and test database names", () => {
    expect(() =>
      assertDevelopmentDemoSeedAllowed({
        ZURIDESK_ALLOW_DEMO_SEED: "true",
        MONGODB_DB_NAME: "zuridesk_test_demo"
      })
    ).not.toThrow();
  });

  it("rejects non-Argon2id credential material before database access", async () => {
    await expect(
      seedDevelopmentDemoFixtures({
        passwordHashes: {
          owner: "not-a-password-hash",
          manager: "$argon2id$manager",
          receptionist: "$argon2id$receptionist",
          stylistA: "$argon2id$stylist-a",
          stylistB: "$argon2id$stylist-b"
        }
      })
    ).rejects.toThrow("owner must use Argon2id");
  });
});
