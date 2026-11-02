import { describe, expect, it } from "vitest";

describe("integration test environment", () => {
  it("requires a real MongoDB replica-set URI", () => {
    expect(
      process.env.TEST_MONGODB_URI,
      "TEST_MONGODB_URI is required; tenant isolation cannot be proven by skipped tests"
    ).toBeTruthy();
  });
});
