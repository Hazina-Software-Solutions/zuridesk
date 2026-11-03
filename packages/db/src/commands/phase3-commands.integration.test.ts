import { createHash, randomUUID } from "node:crypto";

import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectDatabase, disconnectDatabase, getInternalDatabase } from "../connection";
import {
  InviteModel,
  LocationModel,
  MembershipModel,
  TenantModel,
  UserModel
} from "../models/identity-models";
import { AuthChallengeModel, AuthSessionModel } from "../models/phase3-models";
import { migrations } from "../migrations/registry";
import { runMigrations } from "../migrations/runner";
import {
  administerMembership,
  createAuthChallenge,
  createSession,
  getActiveSession,
  issueOrResendInvite,
  prevalidateAuthChallenge,
  prevalidateInvite,
  revokeInvite,
  rotateSession
} from "./phase3-commands";

const uri = process.env.TEST_MONGODB_URI;
const databaseName = `zuridesk_test_phase3_commands_${randomUUID().replaceAll("-", "")}`;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

describe.skipIf(uri === undefined)("Phase 3 invariant-preserving commands", () => {
  const tenantId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const userA = new Types.ObjectId();
  const userB = new Types.ObjectId();
  const membershipA = new Types.ObjectId();
  const membershipB = new Types.ObjectId();

  beforeAll(async () => {
    await connectDatabase({ uri: uri!, databaseName });
    await runMigrations(getInternalDatabase(), migrations);
    await UserModel.create([
      { _id: userA, schemaVersion: 1, displayName: "Owner A", status: "active", deletedAt: null },
      { _id: userB, schemaVersion: 1, displayName: "Owner B", status: "active", deletedAt: null }
    ]);
    await TenantModel.create({
      _id: tenantId,
      schemaVersion: 1,
      name: "Concurrency",
      defaultLocationId: locationId,
      status: "active",
      deletedAt: null,
      ownerGuardVersion: 0
    });
    await LocationModel.create({
      _id: locationId,
      schemaVersion: 1,
      tenantId,
      name: "Main",
      timezone: "Africa/Nairobi",
      status: "active",
      deletedAt: null
    });
    await MembershipModel.create([
      {
        _id: membershipA,
        schemaVersion: 1,
        tenantId,
        userId: userA,
        roleKeys: ["owner"],
        status: "active",
        joinedAt: new Date(),
        revokedAt: null,
        deletedAt: null
      },
      {
        _id: membershipB,
        schemaVersion: 1,
        tenantId,
        userId: userB,
        roleKeys: ["owner"],
        status: "active",
        joinedAt: new Date(),
        revokedAt: null,
        deletedAt: null
      }
    ]);
  });

  it("caps challenge failures at five without consuming the credential", async () => {
    const publicId = new Types.ObjectId().toHexString();
    const subjectDigest = digest("challenge-subject");
    const tokenDigest = digest("challenge-secret");
    await createAuthChallenge({
      publicId,
      purpose: "owner_signup",
      subjectKeyVersion: "v1",
      subjectDigest,
      tokenDigest,
      expiresAt: new Date(Date.now() + 60_000)
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        prevalidateAuthChallenge({
          publicId,
          purpose: "owner_signup",
          subjectKeyVersion: "v1",
          subjectDigest: digest(`wrong-subject-${attempt}`),
          tokenDigest,
          now: new Date()
        })
      ).resolves.toBe(false);
    }
    await expect(
      prevalidateAuthChallenge({
        publicId,
        purpose: "owner_signup",
        subjectKeyVersion: "v1",
        subjectDigest,
        tokenDigest,
        now: new Date()
      })
    ).resolves.toBe(false);
    expect(await AuthChallengeModel.findOne({ publicId }).lean()).toMatchObject({
      failedAttempts: 5,
      consumedAt: null
    });
  });

  afterAll(async () => {
    await getInternalDatabase().dropDatabase();
    await disconnectDatabase();
  });

  it("serializes competing owner removals through tenant guard state", async () => {
    const outcomes = await Promise.allSettled([
      administerMembership({
        tenantId: tenantId.toHexString(),
        actorUserId: userA.toHexString(),
        targetMembershipId: membershipB.toHexString(),
        nextRoleKeys: ["manager"]
      }),
      administerMembership({
        tenantId: tenantId.toHexString(),
        actorUserId: userB.toHexString(),
        targetMembershipId: membershipA.toHexString(),
        nextRoleKeys: ["manager"]
      })
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(
      await MembershipModel.countDocuments({ tenantId, status: "active", roleKeys: "owner" })
    ).toBe(1);
    expect((await TenantModel.findById(tenantId).lean())?.ownerGuardVersion).toBeGreaterThan(0);
  });

  it("expires pending invites before insertion and gives a concurrent loser a stable conflict", async () => {
    await InviteModel.create({
      schemaVersion: 2,
      tenantId,
      recipient: { kind: "email", value: "staff@example.com" },
      roleKeys: ["stylist"],
      tokenDigest: digest("expired"),
      status: "pending",
      expiresAt: new Date(Date.now() - 1000),
      acceptedAt: null,
      acceptedByUserId: null,
      revokedAt: null
    });
    const issue = (label: string) =>
      issueOrResendInvite({
        inviteId: new Types.ObjectId().toHexString(),
        tenantId: tenantId.toHexString(),
        actorUserId: userA.toHexString(),
        recipientEmail: "staff@example.com",
        roleKeys: ["stylist"],
        tokenDigest: digest(label),
        expiresAt: new Date(Date.now() + 60_000),
        resend: false
      });
    const outcomes = await Promise.allSettled([issue("one"), issue("two")]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { code: "CONFLICT" } });
    expect(
      await InviteModel.countDocuments({
        tenantId,
        "recipient.value": "staff@example.com",
        status: "pending"
      })
    ).toBe(1);
    const pending = await InviteModel.findOne({
      tenantId,
      "recipient.value": "staff@example.com",
      status: "pending"
    })
      .select("+tokenDigest")
      .lean();
    expect(pending).not.toBeNull();
    await expect(
      prevalidateInvite({
        inviteId: pending!._id.toHexString(),
        tokenDigest: pending!.tokenDigest,
        now: new Date()
      })
    ).resolves.toBe(true);
    const plan = await getInternalDatabase()
      .collection("invites")
      .find({ _id: pending!._id, tokenDigest: pending!.tokenDigest })
      .explain("executionStats");
    expect(plan).toMatchObject({
      executionStats: { totalDocsExamined: 1, totalKeysExamined: 1 }
    });
  });

  it("rechecks live invite authority and supports audited manual revocation", async () => {
    const actorUserId = new Types.ObjectId();
    const actorMembershipId = new Types.ObjectId();
    await UserModel.create({
      _id: actorUserId,
      schemaVersion: 1,
      displayName: "Invite manager",
      status: "active",
      deletedAt: null
    });
    await MembershipModel.create({
      _id: actorMembershipId,
      schemaVersion: 1,
      tenantId,
      userId: actorUserId,
      roleKeys: ["manager"],
      status: "active",
      joinedAt: new Date(),
      revokedAt: null,
      deletedAt: null
    });
    const inviteId = new Types.ObjectId().toHexString();
    await issueOrResendInvite({
      inviteId,
      tenantId: tenantId.toHexString(),
      actorUserId: actorUserId.toHexString(),
      recipientEmail: "manual-revoke@example.com",
      roleKeys: ["stylist"],
      tokenDigest: digest("manual-revoke"),
      expiresAt: new Date(Date.now() + 60_000),
      resend: false
    });
    await revokeInvite({
      tenantId: tenantId.toHexString(),
      actorUserId: actorUserId.toHexString(),
      inviteId,
      now: new Date()
    });
    expect(await InviteModel.findById(inviteId).lean()).toMatchObject({ status: "revoked" });

    const ownerMembership = await MembershipModel.findOne({
      tenantId,
      status: "active",
      roleKeys: "owner"
    }).lean();
    expect(ownerMembership).not.toBeNull();
    for (const targetRole of ["owner", "manager"] as const) {
      const elevatedInviteId = new Types.ObjectId().toHexString();
      await issueOrResendInvite({
        inviteId: elevatedInviteId,
        tenantId: tenantId.toHexString(),
        actorUserId: ownerMembership!.userId.toHexString(),
        recipientEmail: `future-${targetRole}@example.com`,
        roleKeys: [targetRole],
        tokenDigest: digest(`future-${targetRole}`),
        expiresAt: new Date(Date.now() + 60_000),
        resend: false
      });
      await expect(
        revokeInvite({
          tenantId: tenantId.toHexString(),
          actorUserId: actorUserId.toHexString(),
          inviteId: elevatedInviteId,
          now: new Date()
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await InviteModel.findById(elevatedInviteId).lean()).toMatchObject({
        status: "pending",
        revokedAt: null
      });
      await expect(
        revokeInvite({
          tenantId: tenantId.toHexString(),
          actorUserId: ownerMembership!.userId.toHexString(),
          inviteId: elevatedInviteId,
          now: new Date()
        })
      ).resolves.toBeUndefined();
      expect(await InviteModel.findById(elevatedInviteId).lean()).toMatchObject({
        status: "revoked"
      });
    }

    const revokedAt = new Date();
    const concurrent = await Promise.allSettled([
      issueOrResendInvite({
        inviteId: new Types.ObjectId().toHexString(),
        tenantId: tenantId.toHexString(),
        actorUserId: actorUserId.toHexString(),
        recipientEmail: "concurrent-revoke@example.com",
        roleKeys: ["stylist"],
        tokenDigest: digest("concurrent-revoke"),
        expiresAt: new Date(Date.now() + 60_000),
        resend: false
      }),
      MembershipModel.updateOne(
        { _id: actorMembershipId },
        { $set: { status: "revoked", revokedAt, deletedAt: revokedAt } }
      )
    ]);
    expect(concurrent[1]).toMatchObject({ status: "fulfilled" });
    await expect(
      issueOrResendInvite({
        inviteId: new Types.ObjectId().toHexString(),
        tenantId: tenantId.toHexString(),
        actorUserId: actorUserId.toHexString(),
        recipientEmail: "forbidden@example.com",
        roleKeys: ["stylist"],
        tokenDigest: digest("forbidden"),
        expiresAt: new Date(Date.now() + 60_000),
        resend: false
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await InviteModel.countDocuments({
        tenantId,
        "recipient.value": "forbidden@example.com"
      })
    ).toBe(0);
  });

  it("allows one refresh rotation winner and revokes the family on reuse", async () => {
    const now = new Date();
    const familyId = randomUUID();
    const session = await createSession({
      userId: userA.toHexString(),
      familyId,
      refreshDigest: digest("current"),
      csrfDigest: digest("csrf"),
      transport: "mobile",
      activeTenantId: tenantId.toHexString(),
      now,
      idleExpiresAt: new Date(now.getTime() + 60_000),
      absoluteExpiresAt: new Date(now.getTime() + 120_000)
    });
    const rotate = (label: string) =>
      rotateSession({
        familyId,
        presentedDigest: digest("current"),
        expectedTransport: "mobile",
        nextDigest: digest(label),
        nextCsrfDigest: digest(`csrf-${label}`),
        now: new Date(),
        idleExpiresAt: new Date(Date.now() + 60_000)
      });
    const outcomes = await Promise.allSettled([rotate("next-a"), rotate("next-b")]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await expect(getActiveSession(session.sessionId, userA.toHexString())).resolves.toBeNull();
  });

  it("does not revoke a refresh family for an unrecognized secret", async () => {
    const now = new Date();
    const familyId = randomUUID();
    const session = await createSession({
      userId: userA.toHexString(),
      familyId,
      refreshDigest: digest("known-secret"),
      csrfDigest: digest("known-csrf"),
      transport: "mobile",
      activeTenantId: tenantId.toHexString(),
      now,
      idleExpiresAt: new Date(now.getTime() + 60_000),
      absoluteExpiresAt: new Date(now.getTime() + 120_000)
    });
    await expect(
      rotateSession({
        familyId,
        presentedDigest: digest("unknown-secret"),
        expectedTransport: "mobile",
        nextDigest: digest("unused-next"),
        nextCsrfDigest: digest("unused-csrf"),
        now: new Date(),
        idleExpiresAt: new Date(Date.now() + 60_000)
      })
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL" });
    await expect(getActiveSession(session.sessionId, userA.toHexString())).resolves.not.toBeNull();
  });

  it("does not rotate or revoke a refresh family through the wrong transport", async () => {
    for (const transport of ["web", "mobile"] as const) {
      const now = new Date();
      const familyId = randomUUID();
      const session = await createSession({
        userId: userA.toHexString(),
        familyId,
        refreshDigest: digest(`${transport}-current`),
        csrfDigest: digest(`${transport}-csrf`),
        transport,
        activeTenantId: tenantId.toHexString(),
        now,
        idleExpiresAt: new Date(now.getTime() + 60_000),
        absoluteExpiresAt: new Date(now.getTime() + 120_000)
      });
      await expect(
        rotateSession({
          familyId,
          presentedDigest: digest(`${transport}-current`),
          expectedTransport: transport === "web" ? "mobile" : "web",
          nextDigest: digest(`${transport}-wrong-next`),
          nextCsrfDigest: digest(`${transport}-wrong-csrf`),
          now: new Date(),
          idleExpiresAt: new Date(Date.now() + 60_000)
        })
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL" });
      await expect(
        getActiveSession(session.sessionId, userA.toHexString())
      ).resolves.not.toBeNull();
      await expect(
        rotateSession({
          familyId,
          presentedDigest: digest(`${transport}-current`),
          expectedTransport: transport,
          nextDigest: digest(`${transport}-right-next`),
          nextCsrfDigest: digest(`${transport}-right-csrf`),
          now: new Date(),
          idleExpiresAt: new Date(Date.now() + 60_000)
        })
      ).resolves.toMatchObject({ sessionId: session.sessionId, transport });
    }
  });

  it("does not persist a session for an inactive user", async () => {
    const inactiveUserId = new Types.ObjectId();
    const familyId = randomUUID();
    await UserModel.create({
      _id: inactiveUserId,
      schemaVersion: 1,
      displayName: "Inactive",
      status: "disabled",
      deletedAt: null
    });
    await expect(
      createSession({
        userId: inactiveUserId.toHexString(),
        familyId,
        refreshDigest: digest("inactive-refresh"),
        csrfDigest: digest("inactive-csrf"),
        transport: "mobile",
        activeTenantId: null,
        now: new Date(),
        idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 120_000)
      })
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL" });
    expect(await AuthSessionModel.countDocuments({ familyId })).toBe(0);
  });
});
