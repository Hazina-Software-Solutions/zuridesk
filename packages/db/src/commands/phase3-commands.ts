import { hasPermission, mayManageTargetRoles, type RoleKey } from "@zuridesk/shared";
import { Types, type ClientSession } from "mongoose";

import { getInternalDatabaseConnection } from "../connection";
import {
  InviteModel,
  LocationModel,
  MembershipModel,
  TenantModel,
  UserModel
} from "../models/identity-models";
import {
  AuthChallengeModel,
  AuthIdentityModel,
  AuthSessionModel,
  RateLimitBucketModel,
  RefreshTokenHistoryModel,
  SecurityEventModel,
  TenantAuditLogModel,
  UserTenantDirectoryModel,
  type ChallengePurpose
} from "../models/phase3-models";
import { DatabaseCommandError, isDuplicateKey, isWriteConflict } from "./errors";

const oid = (value: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(value)) throw new DatabaseCommandError("NOT_FOUND");
  return new Types.ObjectId(value);
};

const directoryEntry = (membership: {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  roleKeys: RoleKey[];
  status: "active" | "suspended" | "revoked";
}) => ({
  tenantId: membership.tenantId,
  membershipId: membership._id,
  roleKeys: membership.roleKeys,
  status: membership.status
});

async function updateDirectoryEntry(
  membership: {
    _id: Types.ObjectId;
    tenantId: Types.ObjectId;
    userId: Types.ObjectId;
    roleKeys: RoleKey[];
    status: "active" | "suspended" | "revoked";
  },
  session: ClientSession
): Promise<void> {
  const directory = await UserTenantDirectoryModel.findOne({ userId: membership.userId }).session(
    session
  );
  const entry = directoryEntry(membership);
  if (directory === null) {
    await UserTenantDirectoryModel.create(
      [{ schemaVersion: 1, userId: membership.userId, entries: [entry] }],
      { session }
    );
    return;
  }
  const index = directory.entries.findIndex(({ tenantId }) => tenantId.equals(membership.tenantId));
  if (index === -1) directory.entries.push(entry);
  else directory.entries[index] = entry;
  await directory.save({ session });
}

export async function createAuthChallenge(input: {
  publicId: string;
  purpose: ChallengePurpose;
  subjectKeyVersion: string;
  subjectDigest: string;
  tokenDigest: string;
  expiresAt: Date;
}): Promise<string> {
  const now = new Date();
  await AuthChallengeModel.updateMany(
    { subjectDigest: input.subjectDigest, purpose: input.purpose, consumedAt: null },
    { $set: { consumedAt: now } }
  );
  const challenge = await AuthChallengeModel.create({
    schemaVersion: 1,
    payloadVersion: 1,
    ...input,
    failedAttempts: 0,
    consumedAt: null
  });
  return challenge._id.toHexString();
}

export async function getAuthChallengeSubjectKeyVersion(input: {
  publicId: string;
  purpose: ChallengePurpose;
  tokenDigest: string;
  now: Date;
}): Promise<string | null> {
  const challenge = await AuthChallengeModel.findOne({
    publicId: input.publicId,
    purpose: input.purpose,
    payloadVersion: 1,
    tokenDigest: input.tokenDigest,
    consumedAt: null,
    failedAttempts: { $lt: 5 },
    expiresAt: { $gt: input.now }
  })
    .select("subjectKeyVersion")
    .lean();
  if (challenge !== null) return challenge.subjectKeyVersion;
  await AuthChallengeModel.updateOne(
    {
      publicId: input.publicId,
      purpose: input.purpose,
      consumedAt: null,
      failedAttempts: { $lt: 5 },
      expiresAt: { $gt: input.now }
    },
    { $inc: { failedAttempts: 1 } }
  );
  return null;
}

export async function prevalidateAuthChallenge(input: {
  publicId: string;
  purpose: ChallengePurpose;
  subjectKeyVersion: string;
  subjectDigest: string;
  tokenDigest: string;
  now: Date;
}): Promise<boolean> {
  const valid = await AuthChallengeModel.exists({
    publicId: input.publicId,
    purpose: input.purpose,
    payloadVersion: 1,
    subjectKeyVersion: input.subjectKeyVersion,
    subjectDigest: input.subjectDigest,
    tokenDigest: input.tokenDigest,
    consumedAt: null,
    failedAttempts: { $lt: 5 },
    expiresAt: { $gt: input.now }
  });
  if (valid !== null) return true;
  await AuthChallengeModel.updateOne(
    {
      publicId: input.publicId,
      purpose: input.purpose,
      consumedAt: null,
      failedAttempts: { $lt: 5 },
      expiresAt: { $gt: input.now }
    },
    { $inc: { failedAttempts: 1 } }
  );
  return false;
}

export async function findAuthIdentityByEmail(normalizedEmail: string) {
  return AuthIdentityModel.findOne({ normalizedEmail, status: "active" })
    .select("+passwordHash")
    .lean();
}

export async function getAuthenticationUser(
  userId: string
): Promise<{ id: string; displayName: string } | null> {
  const user = await UserModel.findOne({
    _id: oid(userId),
    status: "active",
    deletedAt: null
  }).lean();
  return user === null ? null : { id: user._id.toHexString(), displayName: user.displayName };
}

export async function rehashIdentityPassword(userId: string, passwordHash: string): Promise<void> {
  await AuthIdentityModel.updateOne(
    { userId: oid(userId), status: "active" },
    { $set: { passwordHash } }
  );
}

export async function getActiveSession(sessionId: string, userId: string) {
  const now = new Date();
  const session = await AuthSessionModel.findOne({
    _id: oid(sessionId),
    userId: oid(userId),
    revokedAt: null,
    idleExpiresAt: { $gt: now },
    absoluteExpiresAt: { $gt: now }
  })
    .select("+csrfDigest")
    .lean();
  return session === null
    ? null
    : {
        csrfDigest: session.csrfDigest,
        transport: session.transport,
        activeTenantId: session.activeTenantId?.toHexString() ?? null
      };
}

export async function getRefreshSession(familyId: string) {
  const now = new Date();
  const session = await AuthSessionModel.findOne({
    familyId,
    revokedAt: null,
    idleExpiresAt: { $gt: now },
    absoluteExpiresAt: { $gt: now }
  })
    .select("+csrfDigest")
    .lean();
  return session === null
    ? null
    : {
        userId: session.userId.toHexString(),
        csrfDigest: session.csrfDigest,
        transport: session.transport
      };
}

export async function registerVerifiedOwner(input: {
  publicId: string;
  tokenDigest: string;
  subjectKeyVersion: string;
  subjectDigest: string;
  normalizedEmail: string;
  passwordHash: string;
  displayName: string;
  tenantName: string;
  locationName: string;
  timezone: string;
  now: Date;
}): Promise<{ userId: string; tenantId: string }> {
  try {
    return await getInternalDatabaseConnection().transaction(async (session) => {
      const challenge = await AuthChallengeModel.findOneAndUpdate(
        {
          purpose: "owner_signup",
          publicId: input.publicId,
          payloadVersion: 1,
          subjectKeyVersion: input.subjectKeyVersion,
          subjectDigest: input.subjectDigest,
          tokenDigest: input.tokenDigest,
          consumedAt: null,
          failedAttempts: { $lt: 5 },
          expiresAt: { $gt: input.now }
        },
        { $set: { consumedAt: input.now } },
        { returnDocument: "after", session }
      ).select("+tokenDigest");
      if (challenge === null) throw new DatabaseCommandError("INVALID_CREDENTIAL");

      const userId = new Types.ObjectId();
      const tenantId = new Types.ObjectId();
      const locationId = new Types.ObjectId();
      const membershipId = new Types.ObjectId();
      await UserModel.create(
        [
          {
            _id: userId,
            schemaVersion: 1,
            displayName: input.displayName,
            normalizedEmail: input.normalizedEmail,
            status: "active",
            deletedAt: null
          }
        ],
        { session }
      );
      await AuthIdentityModel.create(
        [
          {
            schemaVersion: 1,
            userId,
            normalizedEmail: input.normalizedEmail,
            passwordHash: input.passwordHash,
            status: "active",
            verifiedAt: input.now
          }
        ],
        { session }
      );
      await TenantModel.create(
        [
          {
            _id: tenantId,
            schemaVersion: 1,
            name: input.tenantName,
            defaultLocationId: locationId,
            status: "active",
            deletedAt: null,
            ownerGuardVersion: 0
          }
        ],
        { session }
      );
      await LocationModel.create(
        [
          {
            _id: locationId,
            schemaVersion: 1,
            tenantId,
            name: input.locationName,
            timezone: input.timezone,
            status: "active",
            deletedAt: null
          }
        ],
        { session }
      );
      await MembershipModel.create(
        [
          {
            _id: membershipId,
            schemaVersion: 1,
            tenantId,
            userId,
            roleKeys: ["owner"],
            status: "active",
            joinedAt: input.now,
            revokedAt: null,
            deletedAt: null
          }
        ],
        { session }
      );
      await UserTenantDirectoryModel.create(
        [
          {
            schemaVersion: 1,
            userId,
            entries: [{ tenantId, membershipId, roleKeys: ["owner"], status: "active" }]
          }
        ],
        { session }
      );
      await TenantAuditLogModel.create(
        [
          {
            schemaVersion: 1,
            tenantId,
            actorUserId: userId,
            action: "owner.registered",
            targetType: "tenant",
            targetId: tenantId.toHexString()
          }
        ],
        { session }
      );
      return { userId: userId.toHexString(), tenantId: tenantId.toHexString() };
    });
  } catch (error) {
    if (isDuplicateKey(error) || isWriteConflict(error)) throw new DatabaseCommandError("CONFLICT");
    throw error;
  }
}

export async function createSession(input: {
  userId: string;
  refreshDigest: string;
  csrfDigest: string;
  transport: "web" | "mobile";
  activeTenantId: string | null;
  now: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  familyId: string;
}): Promise<{ sessionId: string; familyId: string }> {
  const userId = oid(input.userId);
  const activeUser = await UserModel.exists({
    _id: userId,
    status: "active",
    deletedAt: null
  });
  if (activeUser === null) throw new DatabaseCommandError("INVALID_CREDENTIAL");
  const document = await AuthSessionModel.create({
    schemaVersion: 1,
    userId,
    familyId: input.familyId,
    currentRefreshDigest: input.refreshDigest,
    csrfDigest: input.csrfDigest,
    transport: input.transport,
    activeTenantId: input.activeTenantId === null ? null : oid(input.activeTenantId),
    idleExpiresAt: input.idleExpiresAt,
    absoluteExpiresAt: input.absoluteExpiresAt,
    lastUsedAt: input.now,
    revokedAt: null,
    reuseDetectedAt: null
  });
  return { sessionId: document._id.toHexString(), familyId: input.familyId };
}

export async function rotateSession(input: {
  familyId: string;
  presentedDigest: string;
  expectedTransport: "web" | "mobile";
  nextDigest: string;
  nextCsrfDigest: string;
  now: Date;
  idleExpiresAt: Date;
}): Promise<{
  sessionId: string;
  userId: string;
  activeTenantId: string | null;
  absoluteExpiresAt: Date;
  transport: "web" | "mobile";
}> {
  let outcome: {
    sessionId: string;
    userId: string;
    activeTenantId: string | null;
    absoluteExpiresAt: Date;
    transport: "web" | "mobile";
  } | null;
  try {
    outcome = await getInternalDatabaseConnection().transaction(async (session) => {
      const current = await AuthSessionModel.findOne({
        familyId: input.familyId,
        currentRefreshDigest: input.presentedDigest,
        transport: input.expectedTransport,
        revokedAt: null,
        idleExpiresAt: { $gt: input.now },
        absoluteExpiresAt: { $gt: input.now }
      })
        .select("+currentRefreshDigest")
        .session(session);
      if (current === null) {
        const transportMatches = await AuthSessionModel.exists({
          familyId: input.familyId,
          transport: input.expectedTransport
        }).session(session);
        if (transportMatches === null) return null;
        const reused = await RefreshTokenHistoryModel.exists({
          familyId: input.familyId,
          tokenDigest: input.presentedDigest
        }).session(session);
        if (reused !== null) {
          await AuthSessionModel.updateOne(
            { familyId: input.familyId, transport: input.expectedTransport },
            { $set: { revokedAt: input.now, reuseDetectedAt: input.now } },
            { session }
          );
          return null;
        }
        return null;
      }
      await RefreshTokenHistoryModel.create(
        [
          {
            schemaVersion: 1,
            sessionId: current._id,
            familyId: current.familyId,
            tokenDigest: input.presentedDigest,
            expiresAt: current.absoluteExpiresAt
          }
        ],
        { session }
      );
      const result = await AuthSessionModel.updateOne(
        {
          _id: current._id,
          currentRefreshDigest: input.presentedDigest,
          transport: input.expectedTransport,
          revokedAt: null
        },
        {
          $set: {
            currentRefreshDigest: input.nextDigest,
            csrfDigest: input.nextCsrfDigest,
            idleExpiresAt: input.idleExpiresAt,
            lastUsedAt: input.now
          }
        },
        { session }
      );
      if (result.modifiedCount !== 1) throw new DatabaseCommandError("INVALID_CREDENTIAL");
      return {
        sessionId: current._id.toHexString(),
        userId: current.userId.toHexString(),
        activeTenantId: current.activeTenantId?.toHexString() ?? null,
        absoluteExpiresAt: current.absoluteExpiresAt,
        transport: current.transport
      };
    });
  } catch (error) {
    if (!isDuplicateKey(error) && !isWriteConflict(error)) throw error;
    const transportMatches = await AuthSessionModel.exists({
      familyId: input.familyId,
      transport: input.expectedTransport
    });
    if (transportMatches === null) throw new DatabaseCommandError("INVALID_CREDENTIAL");
    const reused = await RefreshTokenHistoryModel.exists({
      familyId: input.familyId,
      tokenDigest: input.presentedDigest
    });
    if (reused !== null) {
      await AuthSessionModel.updateOne(
        { familyId: input.familyId, transport: input.expectedTransport },
        { $set: { revokedAt: input.now, reuseDetectedAt: input.now } }
      );
    }
    throw new DatabaseCommandError("INVALID_CREDENTIAL");
  }
  if (outcome === null) throw new DatabaseCommandError("INVALID_CREDENTIAL");
  return outcome;
}

export async function revokeSession(
  sessionId: string,
  userId: string,
  now = new Date()
): Promise<void> {
  await AuthSessionModel.updateOne(
    { _id: oid(sessionId), userId: oid(userId) },
    { $set: { revokedAt: now } }
  );
}

export async function revokeAllUserSessions(userId: string, now = new Date()): Promise<void> {
  await AuthSessionModel.updateMany(
    { userId: oid(userId), revokedAt: null },
    { $set: { revokedAt: now } }
  );
}

export async function consumePasswordReset(input: {
  publicId: string;
  tokenDigest: string;
  subjectKeyVersion: string;
  subjectDigest: string;
  normalizedEmail: string;
  passwordHash: string;
  now: Date;
}): Promise<boolean> {
  return getInternalDatabaseConnection().transaction(async (session) => {
    const challenge = await AuthChallengeModel.findOneAndUpdate(
      {
        purpose: "password_reset",
        publicId: input.publicId,
        payloadVersion: 1,
        subjectKeyVersion: input.subjectKeyVersion,
        subjectDigest: input.subjectDigest,
        tokenDigest: input.tokenDigest,
        consumedAt: null,
        failedAttempts: { $lt: 5 },
        expiresAt: { $gt: input.now }
      },
      { $set: { consumedAt: input.now } },
      { returnDocument: "after", session }
    );
    if (challenge === null) return false;
    const identity = await AuthIdentityModel.findOneAndUpdate(
      { normalizedEmail: input.normalizedEmail, status: "active" },
      { $set: { passwordHash: input.passwordHash } },
      { returnDocument: "after", session }
    );
    if (identity === null) return false;
    await AuthSessionModel.updateMany(
      { userId: identity.userId, revokedAt: null },
      { $set: { revokedAt: input.now } },
      { session }
    );
    return true;
  });
}

export async function prevalidateInvite(input: {
  inviteId: string;
  tokenDigest: string;
  now: Date;
}): Promise<boolean> {
  if (!Types.ObjectId.isValid(input.inviteId)) return false;
  return (
    (await InviteModel.exists({
      _id: new Types.ObjectId(input.inviteId),
      tokenDigest: input.tokenDigest,
      status: "pending",
      expiresAt: { $gt: input.now }
    })) !== null
  );
}

export async function listAuthorizedTenants(
  userId: string
): Promise<readonly { id: string; name: string; roleKeys: RoleKey[] }[]> {
  const userObjectId = oid(userId);
  const directory = await UserTenantDirectoryModel.findOne({ userId: userObjectId }).lean();
  if (directory === null) return [];
  const result: { id: string; name: string; roleKeys: RoleKey[] }[] = [];
  for (const entry of directory.entries.filter(({ status }) => status === "active")) {
    const [membership, tenant] = await Promise.all([
      MembershipModel.findOne({
        _id: entry.membershipId,
        tenantId: entry.tenantId,
        userId: userObjectId,
        status: "active",
        deletedAt: null
      }).lean(),
      TenantModel.findOne({ _id: entry.tenantId, status: "active", deletedAt: null }).lean()
    ]);
    if (membership !== null && tenant !== null)
      result.push({
        id: tenant._id.toHexString(),
        name: tenant.name,
        roleKeys: [...membership.roleKeys]
      });
  }
  return result;
}

export async function selectActiveTenant(input: {
  sessionId: string;
  userId: string;
  tenantId: string;
}): Promise<readonly RoleKey[]> {
  const membership = await MembershipModel.findOne({
    tenantId: oid(input.tenantId),
    userId: oid(input.userId),
    status: "active",
    deletedAt: null
  }).lean();
  const tenant = await TenantModel.exists({
    _id: oid(input.tenantId),
    status: "active",
    deletedAt: null
  });
  if (membership === null || tenant === null) throw new DatabaseCommandError("FORBIDDEN");
  await AuthSessionModel.updateOne(
    { _id: oid(input.sessionId), userId: oid(input.userId), revokedAt: null },
    { $set: { activeTenantId: oid(input.tenantId) } }
  );
  return membership.roleKeys;
}

export async function clearActiveTenant(sessionId: string, userId: string): Promise<void> {
  await AuthSessionModel.updateOne(
    { _id: oid(sessionId), userId: oid(userId), revokedAt: null },
    { $set: { activeTenantId: null } }
  );
}

export async function verifyLiveTenantAccess(input: {
  sessionId: string;
  userId: string;
  tenantId: string;
}) {
  const [sessionDocument, membership, tenant, user] = await Promise.all([
    AuthSessionModel.exists({
      _id: oid(input.sessionId),
      userId: oid(input.userId),
      activeTenantId: oid(input.tenantId),
      revokedAt: null,
      idleExpiresAt: { $gt: new Date() },
      absoluteExpiresAt: { $gt: new Date() }
    }),
    MembershipModel.findOne({
      tenantId: oid(input.tenantId),
      userId: oid(input.userId),
      status: "active",
      deletedAt: null
    }).lean(),
    TenantModel.exists({ _id: oid(input.tenantId), status: "active", deletedAt: null }),
    UserModel.exists({ _id: oid(input.userId), status: "active", deletedAt: null })
  ]);
  return sessionDocument === null || membership === null || tenant === null || user === null
    ? null
    : { roleKeys: membership.roleKeys };
}

export async function consumeRateLimit(input: {
  keyDigest: string;
  now: Date;
  windowMs: number;
  limit: number;
}): Promise<boolean> {
  const windowStartedAt = new Date(
    Math.floor(input.now.getTime() / input.windowMs) * input.windowMs
  );
  const filter = { keyDigest: input.keyDigest, windowStartedAt };
  let result;
  try {
    result = await RateLimitBucketModel.findOneAndUpdate(
      filter,
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(windowStartedAt.getTime() + input.windowMs * 2) }
      },
      { upsert: true, returnDocument: "after" }
    ).lean();
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    result = await RateLimitBucketModel.findOneAndUpdate(
      filter,
      { $inc: { count: 1 } },
      {
        returnDocument: "after"
      }
    ).lean();
  }
  return Number(result?.count ?? 0) <= input.limit;
}

export async function recordSecurityEvent(input: {
  eventType: string;
  subjectDigest: string;
  outcome: string;
  requestId: string;
}): Promise<void> {
  await SecurityEventModel.create({ schemaVersion: 1, ...input });
}

export async function issueOrResendInvite(input: {
  inviteId: string;
  tenantId: string;
  actorUserId: string;
  recipientEmail: string;
  roleKeys: RoleKey[];
  tokenDigest: string;
  expiresAt: Date;
  resend: boolean;
}): Promise<string> {
  const now = new Date();
  const tenantObjectId = oid(input.tenantId);
  const expectedPending = await InviteModel.findOne({
    tenantId: tenantObjectId,
    "recipient.kind": "email",
    "recipient.value": input.recipientEmail,
    status: "pending",
    expiresAt: { $gt: now }
  })
    .select("_id")
    .lean();
  try {
    return await getInternalDatabaseConnection().transaction(async (session) => {
      const tenantId = tenantObjectId;
      const tenant = await TenantModel.exists({
        _id: tenantId,
        status: "active",
        deletedAt: null
      }).session(session);
      const actor = await MembershipModel.findOne({
        tenantId,
        userId: oid(input.actorUserId),
        status: "active",
        deletedAt: null
      }).session(session);
      if (
        tenant === null ||
        actor === null ||
        !hasPermission(actor.roleKeys, "invite:create") ||
        !mayManageTargetRoles(actor.roleKeys, input.roleKeys)
      ) {
        throw new DatabaseCommandError("FORBIDDEN");
      }
      await InviteModel.updateMany(
        {
          tenantId,
          "recipient.kind": "email",
          "recipient.value": input.recipientEmail,
          status: "pending",
          expiresAt: { $lte: now }
        },
        { $set: { status: "revoked", revokedAt: now } },
        { session }
      );
      const existing = await InviteModel.findOne({
        tenantId,
        "recipient.kind": "email",
        "recipient.value": input.recipientEmail,
        status: "pending"
      }).session(session);
      if (existing !== null && !input.resend) throw new DatabaseCommandError("CONFLICT");
      if (
        input.resend &&
        (expectedPending === null
          ? existing !== null
          : existing === null || !existing._id.equals(expectedPending._id))
      ) {
        throw new DatabaseCommandError("CONFLICT");
      }
      if (existing !== null) {
        existing.status = "revoked";
        existing.revokedAt = now;
        await existing.save({ session });
      }
      const [invite] = await InviteModel.create(
        [
          {
            _id: oid(input.inviteId),
            schemaVersion: 2,
            tenantId,
            recipient: { kind: "email", value: input.recipientEmail },
            roleKeys: input.roleKeys,
            tokenDigest: input.tokenDigest,
            status: "pending",
            expiresAt: input.expiresAt,
            acceptedAt: null,
            acceptedByUserId: null,
            revokedAt: null
          }
        ],
        { session }
      );
      if (invite === undefined) throw new Error("Invite insertion failed");
      await TenantAuditLogModel.create(
        [
          {
            schemaVersion: 1,
            tenantId,
            actorUserId: actor.userId,
            action: input.resend ? "invite.resent" : "invite.issued",
            targetType: "invite",
            targetId: invite._id.toHexString()
          }
        ],
        { session }
      );
      return invite._id.toHexString();
    });
  } catch (error) {
    if (isDuplicateKey(error) || isWriteConflict(error)) throw new DatabaseCommandError("CONFLICT");
    throw error;
  }
}

export async function acceptInvite(input: {
  inviteId: string;
  tokenDigest: string;
  authenticatedUserId?: string;
  newUser?: { displayName: string; passwordHash: string };
  now: Date;
}): Promise<{ userId: string; tenantId: string }> {
  try {
    return await getInternalDatabaseConnection().transaction(async (session) => {
      const invite = await InviteModel.findOne({
        _id: oid(input.inviteId),
        status: "pending",
        expiresAt: { $gt: input.now },
        tokenDigest: input.tokenDigest
      })
        .select("+tokenDigest")
        .session(session);
      if (invite === null || invite.recipient.kind !== "email")
        throw new DatabaseCommandError("INVALID_CREDENTIAL");
      const tenant = await TenantModel.exists({
        _id: invite.tenantId,
        status: "active",
        deletedAt: null
      }).session(session);
      if (tenant === null) throw new DatabaseCommandError("FORBIDDEN");
      let userId: Types.ObjectId;
      if (input.authenticatedUserId !== undefined) {
        userId = oid(input.authenticatedUserId);
        const user = await UserModel.exists({
          _id: userId,
          status: "active",
          deletedAt: null
        }).session(session);
        const identity = await AuthIdentityModel.findOne({
          userId,
          normalizedEmail: invite.recipient.value,
          status: "active"
        }).session(session);
        if (user === null || identity === null) throw new DatabaseCommandError("FORBIDDEN");
      } else {
        if (input.newUser === undefined) throw new DatabaseCommandError("INVALID_CREDENTIAL");
        userId = new Types.ObjectId();
        await UserModel.create(
          [
            {
              _id: userId,
              schemaVersion: 1,
              displayName: input.newUser.displayName,
              normalizedEmail: invite.recipient.value,
              status: "active",
              deletedAt: null
            }
          ],
          { session }
        );
        await AuthIdentityModel.create(
          [
            {
              schemaVersion: 1,
              userId,
              normalizedEmail: invite.recipient.value,
              passwordHash: input.newUser.passwordHash,
              status: "active",
              verifiedAt: input.now
            }
          ],
          { session }
        );
      }
      const active = await MembershipModel.exists({
        tenantId: invite.tenantId,
        userId,
        status: "active",
        deletedAt: null
      }).session(session);
      if (active !== null) throw new DatabaseCommandError("CONFLICT");
      const membershipId = new Types.ObjectId();
      const [membership] = await MembershipModel.create(
        [
          {
            _id: membershipId,
            schemaVersion: 1,
            tenantId: invite.tenantId,
            userId,
            roleKeys: invite.roleKeys,
            status: "active",
            joinedAt: input.now,
            revokedAt: null,
            deletedAt: null
          }
        ],
        { session }
      );
      if (membership === undefined) throw new Error("Membership insertion failed");
      invite.status = "accepted";
      invite.acceptedAt = input.now;
      invite.acceptedByUserId = userId;
      await invite.save({ session });
      await updateDirectoryEntry(membership, session);
      await TenantAuditLogModel.create(
        [
          {
            schemaVersion: 1,
            tenantId: invite.tenantId,
            actorUserId: userId,
            action: "invite.accepted",
            targetType: "membership",
            targetId: membershipId.toHexString()
          }
        ],
        { session }
      );
      return { userId: userId.toHexString(), tenantId: invite.tenantId.toHexString() };
    });
  } catch (error) {
    if (isDuplicateKey(error) || isWriteConflict(error)) throw new DatabaseCommandError("CONFLICT");
    throw error;
  }
}

export async function revokeInvite(input: {
  tenantId: string;
  actorUserId: string;
  inviteId: string;
  now: Date;
}): Promise<void> {
  try {
    await getInternalDatabaseConnection().transaction(async (session) => {
      const tenantId = oid(input.tenantId);
      const tenant = await TenantModel.exists({
        _id: tenantId,
        status: "active",
        deletedAt: null
      }).session(session);
      const actor = await MembershipModel.findOne({
        tenantId,
        userId: oid(input.actorUserId),
        status: "active",
        deletedAt: null
      }).session(session);
      const invite = await InviteModel.findOne({
        _id: oid(input.inviteId),
        tenantId,
        status: "pending"
      }).session(session);
      if (tenant === null || actor === null || !hasPermission(actor.roleKeys, "invite:revoke")) {
        throw new DatabaseCommandError("FORBIDDEN");
      }
      if (invite === null) throw new DatabaseCommandError("NOT_FOUND");
      if (!mayManageTargetRoles(actor.roleKeys, invite.roleKeys)) {
        throw new DatabaseCommandError("FORBIDDEN");
      }
      invite.status = "revoked";
      invite.revokedAt = input.now;
      await invite.save({ session });
      await TenantAuditLogModel.create(
        [
          {
            schemaVersion: 1,
            tenantId,
            actorUserId: actor.userId,
            action: "invite.revoked",
            targetType: "invite",
            targetId: invite._id.toHexString()
          }
        ],
        { session }
      );
    });
  } catch (error) {
    if (isWriteConflict(error)) throw new DatabaseCommandError("CONFLICT");
    throw error;
  }
}

export async function administerMembership(input: {
  tenantId: string;
  actorUserId: string;
  targetMembershipId: string;
  nextRoleKeys?: RoleKey[];
  nextStatus?: "active" | "suspended" | "revoked";
}): Promise<void> {
  try {
    await getInternalDatabaseConnection().transaction(async (session) => {
      const tenantId = oid(input.tenantId);
      const tenant = await TenantModel.exists({
        _id: tenantId,
        status: "active",
        deletedAt: null
      }).session(session);
      const actor = await MembershipModel.findOne({
        tenantId,
        userId: oid(input.actorUserId),
        status: "active",
        deletedAt: null
      }).session(session);
      const target = await MembershipModel.findOne({
        _id: oid(input.targetMembershipId),
        tenantId
      }).session(session);
      if (tenant === null || actor === null || target === null)
        throw new DatabaseCommandError("NOT_FOUND");
      const desiredRoles = input.nextRoleKeys ?? target.roleKeys;
      if (
        !hasPermission(actor.roleKeys, "membership:update") ||
        !mayManageTargetRoles(actor.roleKeys, desiredRoles) ||
        (!actor.roleKeys.includes("owner") &&
          target.roleKeys.some((role) => role === "owner" || role === "manager"))
      )
        throw new DatabaseCommandError("FORBIDDEN");
      const removesOwner =
        target.status === "active" &&
        target.roleKeys.includes("owner") &&
        ((input.nextStatus !== undefined && input.nextStatus !== "active") ||
          !desiredRoles.includes("owner"));
      if (removesOwner) {
        await TenantModel.updateOne(
          { _id: tenantId },
          { $inc: { ownerGuardVersion: 1 } },
          { session }
        );
        const activeOwners = await MembershipModel.countDocuments({
          tenantId,
          status: "active",
          deletedAt: null,
          roleKeys: "owner"
        }).session(session);
        if (activeOwners <= 1) throw new DatabaseCommandError("LAST_OWNER");
      }
      target.roleKeys = [...desiredRoles];
      if (input.nextStatus !== undefined) {
        target.status = input.nextStatus;
        const revoked = input.nextStatus === "revoked";
        target.revokedAt = revoked ? new Date() : null;
        target.deletedAt = revoked ? target.revokedAt : null;
      }
      await target.save({ session });
      await updateDirectoryEntry(target, session);
      await TenantAuditLogModel.create(
        [
          {
            schemaVersion: 1,
            tenantId,
            actorUserId: actor.userId,
            action: "membership.updated",
            targetType: "membership",
            targetId: target._id.toHexString()
          }
        ],
        { session }
      );
    });
  } catch (error) {
    if (isWriteConflict(error)) throw new DatabaseCommandError("CONFLICT");
    throw error;
  }
}
