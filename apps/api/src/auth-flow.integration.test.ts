import { generateKeyPairSync, randomUUID } from "node:crypto";

import { connectDatabase, disconnectDatabase } from "@zuridesk/db";
import { getTestDatabase, runTestMigrations, testMigrations } from "@zuridesk/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "./app";
import { AccessTokenKeys, PurposeKeyRing } from "./auth/crypto";
import { CaptureDelivery } from "./auth/delivery";
import { AuthService } from "./auth/service";

const uri = process.env.TEST_MONGODB_URI;
const databaseName = `zuridesk_test_api_${randomUUID().replaceAll("-", "")}`;
const origin = "https://app.zuridesk.test";

function tokenFromFragment(url: string): string {
  const fragment = new URL(url).hash.slice(1);
  const token = new URLSearchParams(fragment).get("token");
  if (token === null) throw new Error("Captured link has no token fragment");
  return token;
}

interface TestSession {
  accessToken?: string;
  refreshToken?: string;
  csrfToken?: string;
  activeTenantId: string | null;
  tenants: Array<{ id: string }>;
}

function cookies(raw: string | string[] | undefined): string {
  const rows = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return rows.map((row) => row.split(";", 1)[0]).join("; ");
}

describe.skipIf(uri === undefined)("Phase 3 authentication HTTP flow", () => {
  const delivery = new CaptureDelivery();
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const secret = (label: string) => `${label}-${"x".repeat(48)}`;
  const auth = new AuthService(
    {
      access: new AccessTokenKeys(
        "https://api.zuridesk.test",
        "zuridesk-test",
        "test-v1",
        privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        { "test-v1": publicKey.export({ type: "spki", format: "pem" }).toString() }
      ),
      refresh: new PurposeKeyRing("refresh", "v1", { v1: secret("refresh") }),
      challenge: new PurposeKeyRing("challenge", "v1", { v1: secret("challenge") }),
      invite: new PurposeKeyRing("invite", "v1", { v1: secret("invite") }),
      csrf: new PurposeKeyRing("csrf", "v1", { v1: secret("csrf") }),
      subject: new PurposeKeyRing("subject", "v1", { v1: secret("subject") })
    },
    delivery,
    origin
  );
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await connectDatabase({ uri: uri!, databaseName });
    await runTestMigrations(getTestDatabase(), testMigrations);
    app = await buildApp({
      allowedOrigins: [origin],
      checkDatabase: () => Promise.resolve("up"),
      environment: "test",
      logger: false,
      authService: auth
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await getTestDatabase().dropDatabase();
    await disconnectDatabase();
  });

  it("uses inert GET links, secure web cookies, exact origin, CSRF and rotation reuse revocation", async () => {
    const requested = await app.inject({
      method: "POST",
      url: "/v1/auth/signup/request",
      headers: { origin },
      payload: { email: "owner@example.com" }
    });
    expect(requested.statusCode).toBe(202);
    const signupToken = tokenFromFragment(delivery.messages.at(-1)!.fragmentUrl);
    const signupPublicId = signupToken.split(".")[1]!;
    const storedChallenge = await getTestDatabase()
      .collection("auth_challenges")
      .findOne({ publicId: signupPublicId });
    expect(storedChallenge).toMatchObject({
      publicId: signupPublicId,
      purpose: "owner_signup",
      payloadVersion: 1,
      subjectKeyVersion: "v1",
      failedAttempts: 0
    });
    expect(storedChallenge).not.toHaveProperty("normalizedEmail");
    expect(
      (await app.inject({ method: "GET", url: `/v1/auth/signup/complete?token=${signupToken}` }))
        .statusCode
    ).toBe(404);

    const completed = await app.inject({
      method: "POST",
      url: "/v1/auth/signup/complete",
      headers: { origin },
      payload: {
        token: signupToken,
        email: "owner@example.com",
        password: "correct horse battery staple",
        displayName: "Owner",
        tenantName: "Zuri Salon",
        locationName: "Main",
        timezone: "Africa/Nairobi",
        transport: "web"
      }
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).not.toHaveProperty("accessToken");
    expect(completed.json()).not.toHaveProperty("refreshToken");
    const setCookie = completed.headers["set-cookie"] as string[];
    expect(setCookie.join("\n")).toContain("__Host-zd_at=");
    expect(setCookie.join("\n")).toContain("Path=/;");
    expect(setCookie.join("\n")).toContain("__Secure-zd_rt=");
    expect(setCookie.join("\n")).toContain("Path=/v1/auth;");
    expect(setCookie.join("\n")).toContain("HttpOnly");
    expect(setCookie.join("\n")).toContain("Secure");
    expect(setCookie.join("\n")).toContain("SameSite=Lax");
    const completedBody = completed.json<TestSession>();
    const oldCookies = cookies(completed.headers["set-cookie"]);
    const oldCsrf = completedBody.csrfToken!;

    const spoofedMobile = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { origin },
      payload: {
        email: "owner@example.com",
        password: "correct horse battery staple",
        transport: "mobile"
      }
    });
    expect(spoofedMobile.statusCode).toBe(403);
    expect(spoofedMobile.json()).not.toHaveProperty("accessToken");
    expect(spoofedMobile.json()).not.toHaveProperty("refreshToken");
    const mixedRefresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: { origin, cookie: oldCookies, "x-csrf-token": oldCsrf },
      payload: { refreshToken: "v1.fake.fake-secret-that-is-long-enough-to-parse-value" }
    });
    expect(mixedRefresh.statusCode).toBe(403);
    const webRefreshToken = setCookie
      .find((row) => row.startsWith("__Secure-zd_rt="))!
      .split(";", 1)[0]!
      .slice("__Secure-zd_rt=".length);
    const [refreshVersion, refreshFamily] = webRefreshToken.split(".");
    const wrongWebTransport = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: webRefreshToken }
    });
    expect(wrongWebTransport.statusCode).toBe(400);
    const wrongSecret = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: `${refreshVersion}.${refreshFamily}.${"z".repeat(43)}`
      }
    });
    expect(wrongSecret.statusCode).toBe(400);

    const denied = await app.inject({
      method: "POST",
      url: "/v1/tenants/select",
      headers: { origin: "https://attacker.test", cookie: oldCookies, "x-csrf-token": oldCsrf },
      payload: { tenantId: completedBody.activeTenantId }
    });
    expect(denied.statusCode).toBe(403);

    const refreshed = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: { origin, cookie: oldCookies, "x-csrf-token": oldCsrf },
      payload: {}
    });
    expect(refreshed.statusCode).toBe(200);
    const newCsrf = refreshed.json<TestSession>().csrfToken!;
    const reused = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: { origin, cookie: oldCookies, "x-csrf-token": newCsrf },
      payload: {}
    });
    expect(reused.statusCode).toBe(400);
    const revoked = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: {
        origin,
        cookie: cookies(refreshed.headers["set-cookie"]),
        "x-csrf-token": newCsrf
      },
      payload: {}
    });
    expect(revoked.statusCode).toBe(403);

    const mobileSignIn = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "owner@example.com",
        password: "correct horse battery staple",
        transport: "mobile"
      }
    });
    expect(mobileSignIn.statusCode).toBe(200);
    const mobileSession = mobileSignIn.json<TestSession>();
    const wrongMobileTransport = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: {
        origin,
        cookie: `__Secure-zd_rt=${mobileSession.refreshToken}`,
        "x-csrf-token": mobileSession.csrfToken!
      },
      payload: {}
    });
    expect(wrongMobileTransport.statusCode).toBe(403);
    const mobileRefresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: mobileSession.refreshToken }
    });
    expect(mobileRefresh.statusCode).toBe(200);
    expect(mobileRefresh.json()).toHaveProperty("accessToken");
    expect(mobileRefresh.json()).toHaveProperty("refreshToken");
  });

  it("completes a v1 subject-HMAC challenge after v2 becomes current", async () => {
    const subjectKeys = { v1: secret("subject-overlap-v1"), v2: secret("subject-overlap-v2") };
    const issuer = new AuthService(
      { ...auth.keys, subject: new PurposeKeyRing("subject", "v1", subjectKeys) },
      delivery,
      origin
    );
    await issuer.requestOwnerSignup("overlap@example.com");
    const token = tokenFromFragment(delivery.messages.at(-1)!.fragmentUrl);
    expect(
      await getTestDatabase()
        .collection("auth_challenges")
        .findOne({ publicId: token.split(".")[1] })
    ).toMatchObject({ subjectKeyVersion: "v1" });

    const completer = new AuthService(
      { ...auth.keys, subject: new PurposeKeyRing("subject", "v2", subjectKeys) },
      delivery,
      origin
    );
    await expect(
      completer.completeOwnerSignup({
        token,
        email: "overlap@example.com",
        password: "correct horse battery staple",
        displayName: "Overlap owner",
        tenantName: "Overlap salon",
        locationName: "Main",
        timezone: "Africa/Nairobi",
        transport: "mobile"
      })
    ).resolves.toMatchObject({ user: { displayName: "Overlap owner" } });
  });

  it("keeps sign-in enumeration-resistant and rate limits atomically", async () => {
    const wrongExisting = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: "owner@example.com", password: "wrong password value", transport: "mobile" }
    });
    const wrongMissing = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "missing@example.com",
        password: "wrong password value",
        transport: "mobile"
      }
    });
    expect(wrongExisting.statusCode).toBe(401);
    expect(wrongMissing.statusCode).toBe(401);
    expect(wrongExisting.json()).toMatchObject({
      error: { code: "AUTHENTICATION_FAILED", message: "Request rejected" }
    });
    expect(wrongMissing.json()).toMatchObject({
      error: { code: "AUTHENTICATION_FAILED", message: "Request rejected" }
    });

    const prevalidationRequest = await app.inject({
      method: "POST",
      url: "/v1/auth/signup/request",
      payload: { email: "prevalidation@example.com" }
    });
    expect(prevalidationRequest.statusCode).toBe(202);
    const prevalidationToken = tokenFromFragment(delivery.messages.at(-1)!.fragmentUrl);
    const wrongSubject = await app.inject({
      method: "POST",
      url: "/v1/auth/signup/complete",
      payload: {
        token: prevalidationToken,
        email: "wrong-subject@example.com",
        password: "correct horse battery staple",
        displayName: "Wrong subject",
        tenantName: "Must not exist",
        locationName: "Must not exist",
        timezone: "Africa/Nairobi",
        transport: "mobile"
      }
    });
    expect(wrongSubject.statusCode).toBe(400);
    expect(
      await getTestDatabase()
        .collection("auth_challenges")
        .findOne({ publicId: prevalidationToken.split(".")[1] })
    ).toMatchObject({ failedAttempts: 1, consumedAt: null });
    expect(
      await getTestDatabase()
        .collection("auth_identities")
        .countDocuments({ normalizedEmail: "prevalidation@example.com" })
    ).toBe(0);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/signup/request",
        payload: { email: "limited@example.com" }
      });
      expect(response.statusCode).toBe(202);
    }
    const limited = await app.inject({
      method: "POST",
      url: "/v1/auth/signup/request",
      payload: { email: "limited@example.com" }
    });
    expect(limited.statusCode).toBe(429);
  });

  it("enforces live tenant RBAC, invite-bound registration and reset revocation", async () => {
    const ownerSignin = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "owner@example.com",
        password: "correct horse battery staple",
        transport: "mobile"
      }
    });
    expect(ownerSignin.statusCode).toBe(200);
    const owner = ownerSignin.json<TestSession>();
    const selected = await app.inject({
      method: "POST",
      url: "/v1/tenants/select",
      headers: { authorization: `Bearer ${owner.accessToken!}` },
      payload: { tenantId: owner.tenants[0]!.id }
    });
    expect(selected.statusCode).toBe(200);
    const ownerAccess = selected.json<TestSession>().accessToken!;

    const issued = await app.inject({
      method: "POST",
      url: "/v1/invitations",
      headers: { authorization: `Bearer ${ownerAccess}` },
      payload: { email: "manager@example.com", roleKeys: ["manager"], resend: false }
    });
    expect(issued.statusCode).toBe(202);
    const inviteToken = tokenFromFragment(delivery.messages.at(-1)!.fragmentUrl);
    const accepted = await app.inject({
      method: "POST",
      url: "/v1/auth/invitations/accept",
      payload: {
        token: inviteToken,
        displayName: "Manager",
        password: "manager password value",
        transport: "mobile"
      }
    });
    expect(accepted.statusCode).toBe(200);
    const manager = accepted.json<TestSession>();
    const escalation = await app.inject({
      method: "POST",
      url: "/v1/invitations",
      headers: { authorization: `Bearer ${manager.accessToken!}` },
      payload: { email: "owner2@example.com", roleKeys: ["owner"], resend: false }
    });
    expect(escalation.statusCode).toBe(403);

    const forgot = await app.inject({
      method: "POST",
      url: "/v1/auth/password/forgot",
      payload: { email: "manager@example.com" }
    });
    expect(forgot.statusCode).toBe(202);
    const resetToken = tokenFromFragment(delivery.messages.at(-1)!.fragmentUrl);
    const reset = await app.inject({
      method: "POST",
      url: "/v1/auth/password/reset",
      payload: {
        token: resetToken,
        email: "manager@example.com",
        password: "manager replacement password"
      }
    });
    expect(reset.statusCode).toBe(204);
    const revokedAccess = await app.inject({
      method: "POST",
      url: "/v1/tenants/select",
      headers: { authorization: `Bearer ${manager.accessToken!}` },
      payload: { tenantId: manager.activeTenantId }
    });
    expect(revokedAccess.statusCode).toBe(401);
  });

  it("isolates two tenants and handles existing-user acceptance, revoke and membership invariants", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/signup/request",
          payload: { email: "second-owner@example.com" }
        })
      ).statusCode
    ).toBe(202);
    const secondSignupToken = tokenFromFragment(delivery.messages.at(-1)!.fragmentUrl);
    const secondCompleted = await app.inject({
      method: "POST",
      url: "/v1/auth/signup/complete",
      payload: {
        token: secondSignupToken,
        email: "second-owner@example.com",
        password: "second owner password value",
        displayName: "Second owner",
        tenantName: "Second Salon",
        locationName: "Second Main",
        timezone: "Africa/Nairobi",
        transport: "mobile"
      }
    });
    expect(secondCompleted.statusCode).toBe(200);
    const secondOwner = secondCompleted.json<TestSession>();
    const secondTenantId = secondOwner.activeTenantId!;

    const firstSignin = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "owner@example.com",
        password: "correct horse battery staple",
        transport: "mobile"
      }
    });
    const firstInitial = firstSignin.json<TestSession>();
    const firstSelected = await app.inject({
      method: "POST",
      url: "/v1/tenants/select",
      headers: { authorization: `Bearer ${firstInitial.accessToken!}` },
      payload: { tenantId: firstInitial.tenants[0]!.id }
    });
    const firstOwner = firstSelected.json<TestSession>();
    const firstTenantId = firstOwner.activeTenantId!;
    const firstAccess = firstOwner.accessToken!;

    const foreignSelection = await app.inject({
      method: "POST",
      url: "/v1/tenants/select",
      headers: { authorization: `Bearer ${firstAccess}` },
      payload: { tenantId: secondTenantId }
    });
    expect(foreignSelection.statusCode).toBe(403);

    const issueForSecondOwner = async (email: string) => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/invitations",
        headers: { authorization: `Bearer ${firstAccess}` },
        payload: { email, roleKeys: ["stylist"], resend: false }
      });
      expect(response.statusCode).toBe(202);
      return tokenFromFragment(delivery.messages.at(-1)!.fragmentUrl);
    };

    const existingToken = await issueForSecondOwner("second-owner@example.com");
    const acceptedExisting = await app.inject({
      method: "POST",
      url: "/v1/auth/invitations/accept",
      headers: { authorization: `Bearer ${secondOwner.accessToken!}` },
      payload: { token: existingToken, transport: "mobile" }
    });
    expect(acceptedExisting.statusCode).toBe(200);
    expect(acceptedExisting.json<TestSession>().activeTenantId).toBe(firstTenantId);

    const conflictToken = await issueForSecondOwner("second-owner@example.com");
    const activeConflict = await app.inject({
      method: "POST",
      url: "/v1/auth/invitations/accept",
      headers: { authorization: `Bearer ${acceptedExisting.json<TestSession>().accessToken!}` },
      payload: { token: conflictToken, transport: "mobile" }
    });
    expect(activeConflict.statusCode).toBe(409);

    const mismatchToken = await issueForSecondOwner("different-person@example.com");
    const mismatch = await app.inject({
      method: "POST",
      url: "/v1/auth/invitations/accept",
      headers: { authorization: `Bearer ${acceptedExisting.json<TestSession>().accessToken!}` },
      payload: { token: mismatchToken, transport: "mobile" }
    });
    expect(mismatch.statusCode).toBe(403);

    const revokeToken = await issueForSecondOwner("revoke-me@example.com");
    const revokeInviteId = revokeToken.split(".")[1]!;
    const revoked = await app.inject({
      method: "DELETE",
      url: `/v1/invitations/${revokeInviteId}`,
      headers: { authorization: `Bearer ${firstAccess}` }
    });
    expect(revoked.statusCode).toBe(204);
    const revokedAccept = await app.inject({
      method: "POST",
      url: "/v1/auth/invitations/accept",
      payload: {
        token: revokeToken,
        displayName: "Revoked recipient",
        password: "revoked recipient password",
        transport: "mobile"
      }
    });
    expect(revokedAccept.statusCode).toBe(400);

    const secondBackToOwnTenant = await app.inject({
      method: "POST",
      url: "/v1/tenants/select",
      headers: {
        authorization: `Bearer ${acceptedExisting.json<TestSession>().accessToken!}`
      },
      payload: { tenantId: secondTenantId }
    });
    expect(secondBackToOwnTenant.statusCode).toBe(200);
    const secondTenantAccess = secondBackToOwnTenant.json<TestSession>().accessToken!;
    const foreignIssued = await app.inject({
      method: "POST",
      url: "/v1/invitations",
      headers: { authorization: `Bearer ${secondTenantAccess}` },
      payload: { email: "foreign@example.com", roleKeys: ["stylist"], resend: false }
    });
    expect(foreignIssued.statusCode).toBe(202);
    const foreignInviteId = tokenFromFragment(delivery.messages.at(-1)!.fragmentUrl).split(".")[1]!;
    const foreignRevoke = await app.inject({
      method: "DELETE",
      url: `/v1/invitations/${foreignInviteId}`,
      headers: { authorization: `Bearer ${firstAccess}` }
    });
    expect(foreignRevoke.statusCode).toBe(400);

    const secondTenant = await getTestDatabase()
      .collection("tenants")
      .findOne({ name: "Second Salon" });
    const secondTenantOwnerMembership = await getTestDatabase()
      .collection("memberships")
      .findOne({ tenantId: secondTenant!._id, roleKeys: "owner" });
    expect(secondTenantOwnerMembership).not.toBeNull();
    const foreignMembershipMutation = await app.inject({
      method: "PATCH",
      url: `/v1/memberships/${secondTenantOwnerMembership!._id.toString()}`,
      headers: { authorization: `Bearer ${firstAccess}` },
      payload: { roleKeys: ["stylist"] }
    });
    expect(foreignMembershipMutation.statusCode).toBe(400);
    const lastOwner = await app.inject({
      method: "PATCH",
      url: `/v1/memberships/${secondTenantOwnerMembership!._id.toString()}`,
      headers: { authorization: `Bearer ${secondTenantAccess}` },
      payload: { roleKeys: ["manager"] }
    });
    expect(lastOwner.statusCode).toBe(409);

    const firstTenant = await getTestDatabase()
      .collection("tenants")
      .findOne({ name: "Zuri Salon" });
    const firstTenantSecondMembership = await getTestDatabase().collection("memberships").findOne({
      tenantId: firstTenant!._id,
      userId: secondTenantOwnerMembership!.userId
    });
    expect(firstTenantSecondMembership).not.toBeNull();
    const administered = await app.inject({
      method: "PATCH",
      url: `/v1/memberships/${firstTenantSecondMembership!._id.toString()}`,
      headers: { authorization: `Bearer ${firstAccess}` },
      payload: { roleKeys: ["receptionist"] }
    });
    expect(administered.statusCode).toBe(204);
  });
});
