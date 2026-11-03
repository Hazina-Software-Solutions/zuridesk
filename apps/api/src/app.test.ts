import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("API foundation", () => {
  it("serves liveness without requiring MongoDB", async () => {
    const app = await buildApp({
      allowedOrigins: ["http://localhost:3000"],
      checkDatabase: () => Promise.resolve("down"),
      environment: "test",
      logger: false
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "zuridesk-api" });
  });

  it("fails readiness safely when MongoDB is unavailable", async () => {
    const app = await buildApp({
      allowedOrigins: ["http://localhost:3000"],
      checkDatabase: () => Promise.resolve("down"),
      environment: "test",
      logger: false
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("mongodb://");
    expect(response.json()).toMatchObject({
      status: "not_ready",
      dependencies: { mongodb: "down" }
    });
  });

  it("rejects an origin outside the allowlist", async () => {
    const app = await buildApp({
      allowedOrigins: ["https://app.example.com"],
      checkDatabase: () => Promise.resolve("up"),
      environment: "test",
      logger: false
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { origin: "https://attacker.example" }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: "CORS_ORIGIN_DENIED", message: "Request rejected" }
    });
  });

  it("fails closed when production authentication is not configured", async () => {
    await expect(
      buildApp({
        allowedOrigins: ["https://app.example.com"],
        checkDatabase: () => Promise.resolve("up"),
        environment: "production",
        logger: false
      })
    ).rejects.toThrow("Authentication service configuration is required in production");
  });
});
