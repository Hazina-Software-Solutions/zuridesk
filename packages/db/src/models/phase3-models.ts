import mongoose, { Schema, type Model, type Types } from "mongoose";

const options = { strict: "throw" as const, timestamps: true as const, versionKey: false as const };
const oid = { type: Schema.Types.ObjectId, required: true, immutable: true } as const;
const digest = { type: String, required: true, match: /^[0-9a-f]{64}$/, select: false } as const;

export interface AuthIdentityDocument {
  _id: Types.ObjectId;
  schemaVersion: 1;
  userId: Types.ObjectId;
  normalizedEmail: string;
  passwordHash: string;
  status: "active" | "disabled";
  verifiedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSessionDocument {
  _id: Types.ObjectId;
  schemaVersion: 1;
  userId: Types.ObjectId;
  familyId: string;
  currentRefreshDigest: string;
  csrfDigest: string;
  transport: "web" | "mobile";
  activeTenantId: Types.ObjectId | null;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  reuseDetectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshTokenHistoryDocument {
  _id: Types.ObjectId;
  schemaVersion: 1;
  sessionId: Types.ObjectId;
  familyId: string;
  tokenDigest: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ChallengePurpose = "owner_signup" | "password_reset";
export interface AuthChallengeDocument {
  _id: Types.ObjectId;
  schemaVersion: 1;
  publicId: string;
  purpose: ChallengePurpose;
  payloadVersion: 1;
  subjectKeyVersion: string;
  subjectDigest: string;
  tokenDigest: string;
  failedAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DirectoryEntryDocument {
  tenantId: Types.ObjectId;
  membershipId: Types.ObjectId;
  roleKeys: ("owner" | "manager" | "receptionist" | "stylist")[];
  status: "active" | "suspended" | "revoked";
}

export interface UserTenantDirectoryDocument {
  _id: Types.ObjectId;
  schemaVersion: 1;
  userId: Types.ObjectId;
  entries: DirectoryEntryDocument[];
  createdAt: Date;
  updatedAt: Date;
}

interface RateLimitBucketDocument {
  keyDigest: string;
  windowStartedAt: Date;
  count: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const authIdentitySchema = new Schema<AuthIdentityDocument>(
  {
    schemaVersion: { type: Number, required: true, immutable: true, enum: [1] },
    userId: oid,
    normalizedEmail: {
      type: String,
      required: true,
      immutable: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    passwordHash: { type: String, required: true, select: false },
    status: { type: String, required: true, enum: ["active", "disabled"], default: "active" },
    verifiedAt: { type: Date, required: true, immutable: true }
  },
  { ...options, collection: "auth_identities" }
);

const authSessionSchema = new Schema<AuthSessionDocument>(
  {
    schemaVersion: { type: Number, required: true, immutable: true, enum: [1] },
    userId: oid,
    familyId: { type: String, required: true, immutable: true, match: /^[0-9a-f-]{36}$/ },
    currentRefreshDigest: digest,
    csrfDigest: digest,
    transport: { type: String, required: true, immutable: true, enum: ["web", "mobile"] },
    activeTenantId: { type: Schema.Types.ObjectId, default: null },
    idleExpiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true, immutable: true },
    lastUsedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    reuseDetectedAt: { type: Date, default: null }
  },
  { ...options, collection: "auth_sessions" }
);

const refreshHistorySchema = new Schema<RefreshTokenHistoryDocument>(
  {
    schemaVersion: { type: Number, required: true, immutable: true, enum: [1] },
    sessionId: oid,
    familyId: { type: String, required: true, immutable: true },
    tokenDigest: { ...digest, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true }
  },
  { ...options, collection: "refresh_token_history" }
);

const authChallengeSchema = new Schema<AuthChallengeDocument>(
  {
    schemaVersion: { type: Number, required: true, immutable: true, enum: [1] },
    publicId: { type: String, required: true, immutable: true, match: /^[0-9a-f]{24}$/ },
    purpose: {
      type: String,
      required: true,
      immutable: true,
      enum: ["owner_signup", "password_reset"]
    },
    payloadVersion: { type: Number, required: true, immutable: true, enum: [1] },
    subjectKeyVersion: {
      type: String,
      required: true,
      immutable: true,
      match: /^[A-Za-z0-9_-]{1,32}$/
    },
    subjectDigest: { ...digest, immutable: true },
    tokenDigest: { ...digest, immutable: true },
    failedAttempts: { type: Number, required: true, default: 0, min: 0, max: 5 },
    expiresAt: { type: Date, required: true, immutable: true },
    consumedAt: { type: Date, default: null }
  },
  { ...options, collection: "auth_challenges" }
);

const directoryEntrySchema = new Schema<DirectoryEntryDocument>(
  {
    tenantId: oid,
    membershipId: oid,
    roleKeys: {
      type: [{ type: String, enum: ["owner", "manager", "receptionist", "stylist"] }],
      required: true
    },
    status: { type: String, required: true, enum: ["active", "suspended", "revoked"] }
  },
  { _id: false, strict: "throw" }
);

const directorySchema = new Schema<UserTenantDirectoryDocument>(
  {
    schemaVersion: { type: Number, required: true, immutable: true, enum: [1] },
    userId: oid,
    entries: { type: [directoryEntrySchema], required: true, default: [] }
  },
  { ...options, collection: "user_tenant_directory" }
);

export const AuthIdentityModel =
  (mongoose.models.AuthIdentity as Model<AuthIdentityDocument> | undefined) ??
  mongoose.model<AuthIdentityDocument>("AuthIdentity", authIdentitySchema);
export const AuthSessionModel =
  (mongoose.models.AuthSession as Model<AuthSessionDocument> | undefined) ??
  mongoose.model<AuthSessionDocument>("AuthSession", authSessionSchema);
export const RefreshTokenHistoryModel =
  (mongoose.models.RefreshTokenHistory as Model<RefreshTokenHistoryDocument> | undefined) ??
  mongoose.model<RefreshTokenHistoryDocument>("RefreshTokenHistory", refreshHistorySchema);
export const AuthChallengeModel =
  (mongoose.models.AuthChallenge as Model<AuthChallengeDocument> | undefined) ??
  mongoose.model<AuthChallengeDocument>("AuthChallenge", authChallengeSchema);
export const UserTenantDirectoryModel =
  (mongoose.models.UserTenantDirectory as Model<UserTenantDirectoryDocument> | undefined) ??
  mongoose.model<UserTenantDirectoryDocument>("UserTenantDirectory", directorySchema);

export const RateLimitBucketModel =
  (mongoose.models.RateLimitBucket as Model<RateLimitBucketDocument> | undefined) ??
  mongoose.model<RateLimitBucketDocument>(
    "RateLimitBucket",
    new Schema<RateLimitBucketDocument>(
      {
        keyDigest: { type: String, required: true },
        windowStartedAt: { type: Date, required: true },
        count: { type: Number, required: true },
        expiresAt: { type: Date, required: true }
      },
      { ...options, collection: "rate_limit_buckets" }
    )
  );
export const SecurityEventModel =
  mongoose.models.SecurityEvent ??
  mongoose.model(
    "SecurityEvent",
    new Schema(
      {
        schemaVersion: { type: Number, required: true, enum: [1] },
        eventType: { type: String, required: true },
        subjectDigest: { type: String, required: true },
        outcome: { type: String, required: true },
        requestId: { type: String, required: true }
      },
      { ...options, collection: "security_events" }
    )
  );
export const TenantAuditLogModel =
  mongoose.models.TenantAuditLog ??
  mongoose.model(
    "TenantAuditLog",
    new Schema(
      {
        schemaVersion: { type: Number, required: true, enum: [1] },
        tenantId: oid,
        actorUserId: oid,
        action: { type: String, required: true },
        targetType: { type: String, required: true },
        targetId: { type: String, required: true }
      },
      { ...options, collection: "tenant_audit_logs" }
    )
  );
