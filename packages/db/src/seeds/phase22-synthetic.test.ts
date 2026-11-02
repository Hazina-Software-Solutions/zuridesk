import { describe, expect, it } from "vitest";

import { assertSyntheticSeedAllowed } from "./phase22-synthetic";

describe("synthetic seed safety gate", () => {
  it("requires explicit opt-in", () => {
    expect(() => assertSyntheticSeedAllowed({ MONGODB_DB_NAME: "zuridesk_test" })).toThrow(
      "ZURIDESK_ALLOW_SYNTHETIC_SEED"
    );
  });

  it("rejects production and unapproved database names", () => {
    expect(() =>
      assertSyntheticSeedAllowed({
        ZURIDESK_ALLOW_SYNTHETIC_SEED: "true",
        NODE_ENV: "production",
        MONGODB_DB_NAME: "zuridesk_test"
      })
    ).toThrow("production");
    expect(() =>
      assertSyntheticSeedAllowed({
        ZURIDESK_ALLOW_SYNTHETIC_SEED: "true",
        MONGODB_DB_NAME: "customer_data"
      })
    ).toThrow("approved");
  });

  it("allows deliberate development and test database names", () => {
    expect(() =>
      assertSyntheticSeedAllowed({
        ZURIDESK_ALLOW_SYNTHETIC_SEED: "true",
        MONGODB_DB_NAME: "zuridesk_test_phase22"
      })
    ).not.toThrow();
  });
});
