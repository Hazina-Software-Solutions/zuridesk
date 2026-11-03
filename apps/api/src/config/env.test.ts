import { describe, expect, it } from "vitest";

import { parseApiEnvironment } from "./env";

const validEnvironment = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: "4000",
  LOG_LEVEL: "silent",
  MONGODB_URI: "mongodb://127.0.0.1:27017/?replicaSet=rs0",
  MONGODB_DB_NAME: "zuridesk_test",
  WEB_ORIGINS: "http://localhost:3000,http://localhost:8081",
  WEB_BASE_URL: "http://localhost:3000",
  JWT_ISSUER: "https://api.zuridesk.test",
  JWT_AUDIENCE: "zuridesk",
  JWT_CURRENT_KID: "test-v1",
  JWT_PRIVATE_KEY_B64: "a".repeat(64),
  JWT_PUBLIC_KEYS_B64_JSON: JSON.stringify({ "test-v1": "b".repeat(64) }),
  AUTH_REFRESH_KEY_VERSION: "v1",
  AUTH_REFRESH_KEYS_JSON: JSON.stringify({ v1: "r".repeat(32) }),
  AUTH_CHALLENGE_KEY_VERSION: "v1",
  AUTH_CHALLENGE_KEYS_JSON: JSON.stringify({ v1: "c".repeat(32) }),
  AUTH_INVITE_KEY_VERSION: "v1",
  AUTH_INVITE_KEYS_JSON: JSON.stringify({ v1: "i".repeat(32) }),
  AUTH_CSRF_KEY_VERSION: "v1",
  AUTH_CSRF_KEYS_JSON: JSON.stringify({ v1: "x".repeat(32) }),
  AUTH_SUBJECT_KEY_VERSION: "v1",
  AUTH_SUBJECT_KEYS_JSON: JSON.stringify({ v1: "s".repeat(32) }),
  AUTH_DELIVERY_MODE: "capture"
};

describe("API environment", () => {
  it("parses validated server-only configuration", () => {
    expect(parseApiEnvironment(validEnvironment)).toMatchObject({
      API_PORT: 4000,
      WEB_ORIGINS: ["http://localhost:3000", "http://localhost:8081"]
    });
  });

  it("fails closed when the MongoDB URI is missing", () => {
    const invalidEnvironment: NodeJS.ProcessEnv = { ...validEnvironment };
    delete invalidEnvironment.MONGODB_URI;
    expect(() => parseApiEnvironment(invalidEnvironment)).toThrow();
  });

  it("forbids capture delivery in production", () => {
    expect(() => parseApiEnvironment({ ...validEnvironment, NODE_ENV: "production" })).toThrow();
  });
});
