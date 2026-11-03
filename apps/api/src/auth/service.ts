import { randomBytes, randomUUID } from "node:crypto";

import {
  acceptInvite,
  administerMembership as administerMembershipCommand,
  clearActiveTenant,
  consumeRateLimit,
  consumePasswordReset,
  createAuthChallenge,
  createSession,
  findAuthIdentityByEmail,
  getActiveSession,
  getAuthChallengeSubjectKeyVersion,
  getAuthenticationUser,
  getRefreshSession,
  issueOrResendInvite,
  listAuthorizedTenants,
  prevalidateAuthChallenge,
  prevalidateInvite,
  recordSecurityEvent,
  rehashIdentityPassword,
  registerVerifiedOwner,
  revokeSession,
  revokeInvite,
  rotateSession,
  selectActiveTenant,
  verifyLiveTenantAccess,
  type DatabaseCommandErrorCode
} from "@zuridesk/db";
import {
  hasPermission,
  mayManageTargetRoles,
  objectIdSchema,
  type Permission,
  type RoleKey,
  type SessionResponse
} from "@zuridesk/shared";

import { hashPassword, verifyPassword } from "./crypto";
import type { AccessTokenKeys, PurposeKeyRing } from "./crypto";
import type { AuthDelivery } from "./delivery";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export class AuthServiceError extends Error {
  constructor(
    readonly code:
      "AUTHENTICATION_FAILED" | "TOKEN_INVALID" | "CONFLICT" | "FORBIDDEN" | "RATE_LIMITED",
    readonly statusCode: 400 | 401 | 403 | 409 | 429
  ) {
    super(code);
    this.name = "AuthServiceError";
  }
}

export interface AuthServiceKeys {
  access: AccessTokenKeys;
  refresh: PurposeKeyRing;
  challenge: PurposeKeyRing;
  invite: PurposeKeyRing;
  csrf: PurposeKeyRing;
  subject: PurposeKeyRing;
}

export class AuthService {
  constructor(
    readonly keys: AuthServiceKeys,
    private readonly delivery: AuthDelivery,
    private readonly webBaseUrl: string
  ) {}

  async requestOwnerSignup(email: string): Promise<void> {
    this.assertDeliveryConfigured();
    const existing = await findAuthIdentityByEmail(email);
    if (existing !== null) return;
    const publicId = randomBytes(12).toString("hex");
    const opaque = this.keys.challenge.issue(publicId);
    await createAuthChallenge({
      publicId,
      purpose: "owner_signup",
      subjectKeyVersion: this.keys.subject.currentVersion,
      subjectDigest: this.keys.subject.digestSubject(email),
      tokenDigest: opaque.digest,
      expiresAt: new Date(Date.now() + 30 * MINUTE)
    });
    await this.delivery.sendEmailLink({
      to: email,
      purpose: "owner_signup",
      fragmentUrl: `${this.webBaseUrl}/signup/complete#token=${encodeURIComponent(opaque.value)}`
    });
  }

  async checkRateLimit(scope: string, subject: string, limit: number): Promise<void> {
    const allowed = await consumeRateLimit({
      keyDigest: this.keys.subject.digestSubject(`${scope}\0${subject}`),
      now: new Date(),
      windowMs: 15 * MINUTE,
      limit
    });
    if (!allowed) throw new AuthServiceError("RATE_LIMITED", 429);
  }

  async authenticate(accessToken: string): Promise<{
    userId: string;
    sessionId: string;
    tenantId: string | null;
    transport: "web" | "mobile";
    csrfDigest: string;
  }> {
    try {
      const claims = this.keys.access.verify(accessToken);
      const session = await getActiveSession(claims.sid, claims.sub);
      if (session === null || session.activeTenantId !== claims.tenantId) {
        throw new AuthServiceError("AUTHENTICATION_FAILED", 401);
      }
      return {
        userId: claims.sub,
        sessionId: claims.sid,
        tenantId: claims.tenantId,
        transport: session.transport,
        csrfDigest: session.csrfDigest
      };
    } catch (error) {
      if (error instanceof AuthServiceError) throw error;
      throw new AuthServiceError("AUTHENTICATION_FAILED", 401);
    }
  }

  verifyCsrf(rawToken: string | undefined, expectedDigest: string): boolean {
    if (rawToken === undefined) return false;
    const parsed = this.keys.csrf.parseAndDigest(rawToken);
    return parsed !== null && this.keys.csrf.matches(expectedDigest, parsed.digest);
  }

  async verifyRefreshCsrf(refreshToken: string, csrfToken: string | undefined): Promise<boolean> {
    const parsedRefresh = this.keys.refresh.parseAndDigest(refreshToken);
    if (parsedRefresh === null) return false;
    const session = await getRefreshSession(parsedRefresh.id);
    return session?.transport === "web" && this.verifyCsrf(csrfToken, session.csrfDigest);
  }

  async authorizeTenant(
    principal: { userId: string; sessionId: string; tenantId: string | null },
    permission: Permission
  ): Promise<readonly RoleKey[]> {
    if (principal.tenantId === null) throw new AuthServiceError("FORBIDDEN", 403);
    const live = await verifyLiveTenantAccess({
      sessionId: principal.sessionId,
      userId: principal.userId,
      tenantId: principal.tenantId
    });
    if (live === null || !hasPermission(live.roleKeys, permission)) {
      throw new AuthServiceError("FORBIDDEN", 403);
    }
    return live.roleKeys;
  }

  async completeOwnerSignup(input: {
    token: string;
    email: string;
    password: string;
    displayName: string;
    tenantName: string;
    locationName: string;
    timezone: string;
    transport: "web" | "mobile";
  }): Promise<SessionResponse> {
    const parsed = this.keys.challenge.parseAndDigest(input.token);
    if (parsed === null) throw new AuthServiceError("TOKEN_INVALID", 400);
    const now = new Date();
    const subjectKeyVersion = await getAuthChallengeSubjectKeyVersion({
      publicId: parsed.id,
      purpose: "owner_signup",
      tokenDigest: parsed.digest,
      now
    });
    if (subjectKeyVersion === null) throw new AuthServiceError("TOKEN_INVALID", 400);
    const subjectDigest = this.keys.subject.digestSubjectAtVersion(input.email, subjectKeyVersion);
    if (subjectDigest === null) throw new AuthServiceError("TOKEN_INVALID", 400);
    if (
      !(await prevalidateAuthChallenge({
        publicId: parsed.id,
        purpose: "owner_signup",
        subjectKeyVersion,
        subjectDigest,
        tokenDigest: parsed.digest,
        now
      }))
    ) {
      throw new AuthServiceError("TOKEN_INVALID", 400);
    }
    const passwordHash = await hashPassword(input.password);
    try {
      const registered = await registerVerifiedOwner({
        publicId: parsed.id,
        tokenDigest: parsed.digest,
        subjectKeyVersion,
        subjectDigest,
        normalizedEmail: input.email,
        passwordHash,
        displayName: input.displayName,
        tenantName: input.tenantName,
        locationName: input.locationName,
        timezone: input.timezone,
        now
      });
      return this.newSession(registered.userId, input.transport, registered.tenantId);
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async signIn(input: {
    email: string;
    password: string;
    transport: "web" | "mobile";
    requestId: string;
  }): Promise<SessionResponse> {
    const identity = await findAuthIdentityByEmail(input.email);
    const checked = await verifyPassword(identity?.passwordHash ?? null, input.password);
    if (!checked.valid || identity === null) {
      await recordSecurityEvent({
        eventType: "auth.sign_in",
        subjectDigest: this.keys.subject.digestSubject(input.email),
        outcome: "failure",
        requestId: input.requestId
      });
      throw new AuthServiceError("AUTHENTICATION_FAILED", 401);
    }
    if (checked.needsRehash)
      await rehashIdentityPassword(
        identity.userId.toHexString(),
        await hashPassword(input.password)
      );
    await recordSecurityEvent({
      eventType: "auth.sign_in",
      subjectDigest: this.keys.subject.digestSubject(input.email),
      outcome: "success",
      requestId: input.requestId
    });
    return this.newSession(identity.userId.toHexString(), input.transport, null);
  }

  async refresh(
    refreshToken: string,
    expectedTransport: "web" | "mobile"
  ): Promise<SessionResponse> {
    const parsed = this.keys.refresh.parseAndDigest(refreshToken);
    if (parsed === null) throw new AuthServiceError("AUTHENTICATION_FAILED", 401);
    const nextRefresh = this.keys.refresh.issue(parsed.id);
    const nextCsrf = this.keys.csrf.issue(parsed.id);
    try {
      const now = new Date();
      const rotated = await rotateSession({
        familyId: parsed.id,
        presentedDigest: parsed.digest,
        expectedTransport,
        nextDigest: nextRefresh.digest,
        nextCsrfDigest: nextCsrf.digest,
        now,
        idleExpiresAt: new Date(now.getTime() + 30 * DAY)
      });
      if (rotated.transport !== expectedTransport) {
        throw new AuthServiceError("AUTHENTICATION_FAILED", 401);
      }
      const [user, tenants] = await Promise.all([
        getAuthenticationUser(rotated.userId),
        listAuthorizedTenants(rotated.userId)
      ]);
      if (user === null) throw new AuthServiceError("AUTHENTICATION_FAILED", 401);
      const activeTenantId = tenants.some(({ id }) => id === rotated.activeTenantId)
        ? rotated.activeTenantId
        : null;
      if (activeTenantId === null && rotated.activeTenantId !== null) {
        await clearActiveTenant(rotated.sessionId, rotated.userId);
      }
      return this.response({
        user,
        tenants,
        activeTenantId,
        sessionId: rotated.sessionId,
        refreshToken: nextRefresh.value,
        csrfToken: nextCsrf.value,
        transport: rotated.transport
      });
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    this.assertDeliveryConfigured();
    const identity = await findAuthIdentityByEmail(email);
    if (identity === null) return;
    const publicId = randomBytes(12).toString("hex");
    const opaque = this.keys.challenge.issue(publicId);
    await createAuthChallenge({
      publicId,
      purpose: "password_reset",
      subjectKeyVersion: this.keys.subject.currentVersion,
      subjectDigest: this.keys.subject.digestSubject(email),
      tokenDigest: opaque.digest,
      expiresAt: new Date(Date.now() + 15 * MINUTE)
    });
    await this.delivery.sendEmailLink({
      to: email,
      purpose: "password_reset",
      fragmentUrl: `${this.webBaseUrl}/reset-password#token=${encodeURIComponent(opaque.value)}`
    });
  }

  async resetPassword(token: string, email: string, password: string): Promise<void> {
    const parsed = this.keys.challenge.parseAndDigest(token);
    if (parsed === null) throw new AuthServiceError("TOKEN_INVALID", 400);
    const now = new Date();
    const subjectKeyVersion = await getAuthChallengeSubjectKeyVersion({
      publicId: parsed.id,
      purpose: "password_reset",
      tokenDigest: parsed.digest,
      now
    });
    if (subjectKeyVersion === null) throw new AuthServiceError("TOKEN_INVALID", 400);
    const subjectDigest = this.keys.subject.digestSubjectAtVersion(email, subjectKeyVersion);
    if (subjectDigest === null) throw new AuthServiceError("TOKEN_INVALID", 400);
    if (
      !(await prevalidateAuthChallenge({
        publicId: parsed.id,
        purpose: "password_reset",
        subjectKeyVersion,
        subjectDigest,
        tokenDigest: parsed.digest,
        now
      }))
    ) {
      throw new AuthServiceError("TOKEN_INVALID", 400);
    }
    const consumed = await consumePasswordReset({
      publicId: parsed.id,
      tokenDigest: parsed.digest,
      subjectKeyVersion,
      subjectDigest,
      normalizedEmail: email,
      passwordHash: await hashPassword(password),
      now
    });
    if (!consumed) throw new AuthServiceError("TOKEN_INVALID", 400);
  }

  async selectTenant(
    sessionId: string,
    userId: string,
    tenantId: string
  ): Promise<SessionResponse> {
    try {
      await selectActiveTenant({ sessionId, userId, tenantId });
      const [user, tenants] = await Promise.all([
        getAuthenticationUser(userId),
        listAuthorizedTenants(userId)
      ]);
      if (user === null) throw new AuthServiceError("AUTHENTICATION_FAILED", 401);
      return this.response({ user, tenants, activeTenantId: tenantId, sessionId });
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await revokeSession(sessionId, userId);
  }

  async issueInvite(input: {
    tenantId: string;
    actorUserId: string;
    email: string;
    roleKeys: RoleKey[];
    resend: boolean;
  }): Promise<void> {
    this.assertDeliveryConfigured();
    const inviteId = randomBytes(12).toString("hex");
    const token = this.keys.invite.issue(inviteId);
    try {
      await issueOrResendInvite({
        inviteId,
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        recipientEmail: input.email,
        roleKeys: input.roleKeys,
        tokenDigest: token.digest,
        expiresAt: new Date(Date.now() + 7 * DAY),
        resend: input.resend
      });
    } catch (error) {
      throw mapDatabaseError(error);
    }
    await this.delivery.sendEmailLink({
      to: input.email,
      purpose: "staff_invite",
      fragmentUrl: `${this.webBaseUrl}/invite#token=${encodeURIComponent(token.value)}`
    });
  }

  async administerMembership(input: {
    principal: { userId: string; sessionId: string; tenantId: string | null };
    membershipId: string;
    roleKeys?: RoleKey[];
    status?: "active" | "suspended" | "revoked";
  }): Promise<void> {
    const actorRoles = await this.authorizeTenant(input.principal, "membership:update");
    if (input.roleKeys !== undefined && !mayManageTargetRoles(actorRoles, input.roleKeys)) {
      throw new AuthServiceError("FORBIDDEN", 403);
    }
    try {
      await administerMembershipCommand({
        tenantId: input.principal.tenantId!,
        actorUserId: input.principal.userId,
        targetMembershipId: input.membershipId,
        ...(input.roleKeys === undefined ? {} : { nextRoleKeys: input.roleKeys }),
        ...(input.status === undefined ? {} : { nextStatus: input.status })
      });
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async acceptInvite(input: {
    token: string;
    principal?: { userId: string; sessionId: string; tenantId: string | null };
    displayName?: string;
    password?: string;
    transport: "web" | "mobile";
  }): Promise<SessionResponse> {
    const parsed = this.keys.invite.parseAndDigest(input.token);
    if (parsed === null) throw new AuthServiceError("TOKEN_INVALID", 400);
    const now = new Date();
    if (!(await prevalidateInvite({ inviteId: parsed.id, tokenDigest: parsed.digest, now }))) {
      throw new AuthServiceError("TOKEN_INVALID", 400);
    }
    const newUser =
      input.principal === undefined
        ? input.displayName === undefined || input.password === undefined
          ? undefined
          : { displayName: input.displayName, passwordHash: await hashPassword(input.password) }
        : undefined;
    try {
      const accepted = await acceptInvite({
        inviteId: parsed.id,
        tokenDigest: parsed.digest,
        ...(input.principal === undefined ? {} : { authenticatedUserId: input.principal.userId }),
        ...(newUser === undefined ? {} : { newUser }),
        now
      });
      if (input.principal !== undefined) {
        return this.selectTenant(
          input.principal.sessionId,
          input.principal.userId,
          accepted.tenantId
        );
      }
      return this.newSession(accepted.userId, input.transport, accepted.tenantId);
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async revokeInvite(input: {
    tenantId: string;
    actorUserId: string;
    inviteId: string;
  }): Promise<void> {
    try {
      await revokeInvite({ ...input, now: new Date() });
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  private async newSession(
    userId: string,
    transport: "web" | "mobile",
    activeTenantId: string | null
  ): Promise<SessionResponse> {
    const now = new Date();
    const [user, tenants] = await Promise.all([
      getAuthenticationUser(userId),
      listAuthorizedTenants(userId)
    ]);
    if (user === null) throw new AuthServiceError("AUTHENTICATION_FAILED", 401);
    const familyId = randomUUID();
    const refresh = this.keys.refresh.issue(familyId);
    const csrf = this.keys.csrf.issue(familyId);
    const session = await createSession({
      userId,
      familyId,
      refreshDigest: refresh.digest,
      csrfDigest: csrf.digest,
      transport,
      activeTenantId,
      now,
      idleExpiresAt: new Date(now.getTime() + 30 * DAY),
      absoluteExpiresAt: new Date(now.getTime() + 90 * DAY)
    });
    return this.response({
      user,
      tenants,
      activeTenantId,
      sessionId: session.sessionId,
      refreshToken: refresh.value,
      csrfToken: csrf.value,
      transport
    });
  }

  private assertDeliveryConfigured(): void {
    if (!this.delivery.configured) {
      throw Object.assign(new Error("Authentication delivery is unavailable"), {
        code: "AUTHENTICATION_UNAVAILABLE",
        statusCode: 503
      });
    }
  }

  private response(input: {
    user: { id: string; displayName: string };
    tenants: readonly { id: string; name: string; roleKeys: RoleKey[] }[];
    activeTenantId: string | null;
    sessionId: string;
    refreshToken?: string;
    csrfToken?: string;
    transport?: "web" | "mobile";
  }): SessionResponse {
    return {
      accessToken: this.keys.access.issue({
        userId: input.user.id,
        sessionId: input.sessionId,
        tenantId: input.activeTenantId
      }),
      ...(input.refreshToken === undefined ? {} : { refreshToken: input.refreshToken }),
      ...(input.csrfToken === undefined ? {} : { csrfToken: input.csrfToken }),
      expiresInSeconds: 600,
      user: { id: objectIdSchema.parse(input.user.id), displayName: input.user.displayName },
      activeTenantId:
        input.activeTenantId === null ? null : objectIdSchema.parse(input.activeTenantId),
      tenants: input.tenants.map((tenant) => ({
        id: objectIdSchema.parse(tenant.id),
        name: tenant.name,
        roleKeys: [...tenant.roleKeys]
      }))
    };
  }
}

function mapDatabaseError(error: unknown): Error {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code as DatabaseCommandErrorCode;
    if (code === "CONFLICT") return new AuthServiceError("CONFLICT", 409);
    if (code === "LAST_OWNER") return new AuthServiceError("CONFLICT", 409);
    if (code === "FORBIDDEN") return new AuthServiceError("FORBIDDEN", 403);
    if (code === "INVALID_CREDENTIAL" || code === "NOT_FOUND")
      return new AuthServiceError("TOKEN_INVALID", 400);
  }
  return error instanceof Error ? error : new Error("Unknown authentication failure");
}
