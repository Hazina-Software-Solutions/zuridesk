import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AccessTokenKeys,
  PASSWORD_POLICY,
  PurposeKeyRing,
  hashPassword,
  verifyPassword
} from "./crypto";

describe("Phase 3 cryptography", () => {
  it("uses the approved Argon2id profile", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toContain("$argon2id$v=19$m=65536,t=3,p=1$");
    await expect(verifyPassword(hash, "correct horse battery staple")).resolves.toEqual({
      valid: true,
      needsRehash: false
    });
    await expect(verifyPassword(null, "wrong-password-value")).resolves.toMatchObject({
      valid: false
    });
    expect(PASSWORD_POLICY.parallelism).toBe(1);
  });

  it("strictly validates EdDSA access claims and kid", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const keys = new AccessTokenKeys(
      "https://api.zuridesk.test",
      "zuridesk",
      "v1",
      privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      { v1: publicKey.export({ type: "spki", format: "pem" }).toString() }
    );
    const token = keys.issue({
      userId: "u",
      sessionId: "s",
      tenantId: null,
      now: new Date("2026-11-03T00:00:00Z")
    });
    expect(keys.verify(token, new Date("2026-11-03T00:05:00Z"))).toMatchObject({
      sub: "u",
      sid: "s",
      tenantId: null
    });
    expect(() => keys.verify(token, new Date("2026-11-03T00:11:00Z"))).toThrow();
    const forged = `${Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "v1" })).toString("base64url")}.${token.split(".").slice(1).join(".")}`;
    expect(() => keys.verify(forged, new Date("2026-11-03T00:05:00Z"))).toThrow();
    const parts = token.split(".");
    const unknownKid = `${Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: "unknown" })).toString("base64url")}.${parts[1]}.${parts[2]}`;
    expect(() => keys.verify(unknownKid, new Date("2026-11-03T00:05:00Z"))).toThrow();

    const wrongIssuer = new AccessTokenKeys(
      "https://wrong-issuer.test",
      "zuridesk",
      "v1",
      privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      { v1: publicKey.export({ type: "spki", format: "pem" }).toString() }
    ).issue({ userId: "u", sessionId: "s", tenantId: null, now: new Date("2026-11-03T00:00:00Z") });
    expect(() => keys.verify(wrongIssuer, new Date("2026-11-03T00:05:00Z"))).toThrow();
    const wrongAudience = new AccessTokenKeys(
      "https://api.zuridesk.test",
      "wrong-audience",
      "v1",
      privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      { v1: publicKey.export({ type: "spki", format: "pem" }).toString() }
    ).issue({ userId: "u", sessionId: "s", tenantId: null, now: new Date("2026-11-03T00:00:00Z") });
    expect(() => keys.verify(wrongAudience, new Date("2026-11-03T00:05:00Z"))).toThrow();
  });

  it("rejects non-Ed25519 and mismatched key material at construction", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(
      () =>
        new AccessTokenKeys(
          "https://api.zuridesk.test",
          "zuridesk",
          "rsa",
          rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
          { rsa: rsa.publicKey.export({ type: "spki", format: "pem" }).toString() }
        )
    ).toThrow("Ed25519");
    const ed448 = generateKeyPairSync("ed448");
    expect(
      () =>
        new AccessTokenKeys(
          "https://api.zuridesk.test",
          "zuridesk",
          "ed448",
          ed448.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
          { ed448: ed448.publicKey.export({ type: "spki", format: "pem" }).toString() }
        )
    ).toThrow("Ed25519");
    const first = generateKeyPairSync("ed25519");
    const second = generateKeyPairSync("ed25519");
    expect(
      () =>
        new AccessTokenKeys(
          "https://api.zuridesk.test",
          "zuridesk",
          "v1",
          first.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
          { v1: second.publicKey.export({ type: "spki", format: "pem" }).toString() }
        )
    ).toThrow("do not match");
  });

  it("purpose-binds opaque digests and supports overlap", () => {
    const refresh = new PurposeKeyRing("refresh", "v2", { v1: "old", v2: "new" });
    const challenge = new PurposeKeyRing("challenge", "v2", { v2: "new" });
    const token = refresh.issue("id");
    expect(refresh.parseAndDigest(token.value)?.digest).toBe(token.digest);
    expect(challenge.parseAndDigest(token.value)?.digest).not.toBe(token.digest);

    const oldSubject = new PurposeKeyRing("subject", "v1", { v1: "old" });
    const overlappingSubject = new PurposeKeyRing("subject", "v2", { v1: "old", v2: "new" });
    expect(overlappingSubject.digestSubjectAtVersion("person@example.com", "v1")).toBe(
      oldSubject.digestSubject("person@example.com")
    );
    expect(overlappingSubject.digestSubjectAtVersion("person@example.com", "missing")).toBeNull();
  });
});
