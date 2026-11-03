import type { ApplicationIndexDefinition } from "../indexes/index-policy";

export const phase3CollectionNames = [
  "auth_identities",
  "auth_sessions",
  "refresh_token_history",
  "auth_challenges",
  "rate_limit_buckets",
  "user_tenant_directory",
  "security_events",
  "tenant_audit_logs"
] as const;

export const phase3IndexManifest = [
  {
    collection: "auth_identities",
    name: "_id_",
    tenantOwned: false,
    kind: "system",
    keys: [["_id", 1]],
    exception: "mongodb_builtin_id"
  },
  {
    collection: "auth_identities",
    name: "normalized_email_unique",
    tenantOwned: false,
    kind: "unique",
    keys: [["normalizedEmail", 1]]
  },
  {
    collection: "auth_identities",
    name: "user_unique",
    tenantOwned: false,
    kind: "unique",
    keys: [["userId", 1]]
  },
  {
    collection: "auth_sessions",
    name: "_id_",
    tenantOwned: false,
    kind: "system",
    keys: [["_id", 1]],
    exception: "mongodb_builtin_id"
  },
  {
    collection: "auth_sessions",
    name: "family_unique",
    tenantOwned: false,
    kind: "unique",
    keys: [["familyId", 1]]
  },
  {
    collection: "auth_sessions",
    name: "user_active_sessions",
    tenantOwned: false,
    kind: "query",
    keys: [
      ["userId", 1],
      ["revokedAt", 1],
      ["idleExpiresAt", 1]
    ]
  },
  {
    collection: "auth_sessions",
    name: "absolute_expiry_ttl",
    tenantOwned: false,
    kind: "ttl",
    keys: [["absoluteExpiresAt", 1]],
    expireAfterSeconds: 0
  },
  {
    collection: "refresh_token_history",
    name: "_id_",
    tenantOwned: false,
    kind: "system",
    keys: [["_id", 1]],
    exception: "mongodb_builtin_id"
  },
  {
    collection: "refresh_token_history",
    name: "refresh_digest_unique",
    tenantOwned: false,
    kind: "unique",
    keys: [["tokenDigest", 1]]
  },
  {
    collection: "refresh_token_history",
    name: "session_history",
    tenantOwned: false,
    kind: "query",
    keys: [
      ["sessionId", 1],
      ["createdAt", -1]
    ]
  },
  {
    collection: "refresh_token_history",
    name: "history_expiry_ttl",
    tenantOwned: false,
    kind: "ttl",
    keys: [["expiresAt", 1]],
    expireAfterSeconds: 0
  },
  {
    collection: "auth_challenges",
    name: "_id_",
    tenantOwned: false,
    kind: "system",
    keys: [["_id", 1]],
    exception: "mongodb_builtin_id"
  },
  {
    collection: "auth_challenges",
    name: "challenge_public_id_unique",
    tenantOwned: false,
    kind: "unique",
    keys: [["publicId", 1]]
  },
  {
    collection: "auth_challenges",
    name: "challenge_digest_unique",
    tenantOwned: false,
    kind: "unique",
    keys: [["tokenDigest", 1]]
  },
  {
    collection: "auth_challenges",
    name: "subject_purpose_active",
    tenantOwned: false,
    kind: "query",
    keys: [
      ["subjectDigest", 1],
      ["subjectKeyVersion", 1],
      ["purpose", 1],
      ["consumedAt", 1],
      ["expiresAt", 1]
    ]
  },
  {
    collection: "auth_challenges",
    name: "challenge_expiry_ttl",
    tenantOwned: false,
    kind: "ttl",
    keys: [["expiresAt", 1]],
    expireAfterSeconds: 0
  },
  {
    collection: "rate_limit_buckets",
    name: "_id_",
    tenantOwned: false,
    kind: "system",
    keys: [["_id", 1]],
    exception: "mongodb_builtin_id"
  },
  {
    collection: "rate_limit_buckets",
    name: "bucket_key_unique",
    tenantOwned: false,
    kind: "unique",
    keys: [
      ["keyDigest", 1],
      ["windowStartedAt", 1]
    ]
  },
  {
    collection: "rate_limit_buckets",
    name: "bucket_expiry_ttl",
    tenantOwned: false,
    kind: "ttl",
    keys: [["expiresAt", 1]],
    expireAfterSeconds: 0
  },
  {
    collection: "user_tenant_directory",
    name: "_id_",
    tenantOwned: false,
    kind: "system",
    keys: [["_id", 1]],
    exception: "mongodb_builtin_id"
  },
  {
    collection: "user_tenant_directory",
    name: "directory_user_unique",
    tenantOwned: false,
    kind: "unique",
    keys: [["userId", 1]]
  },
  {
    collection: "security_events",
    name: "_id_",
    tenantOwned: false,
    kind: "system",
    keys: [["_id", 1]],
    exception: "mongodb_builtin_id"
  },
  {
    collection: "security_events",
    name: "security_event_subject",
    tenantOwned: false,
    kind: "query",
    keys: [
      ["subjectDigest", 1],
      ["createdAt", -1]
    ]
  },
  {
    collection: "tenant_audit_logs",
    name: "_id_",
    tenantOwned: true,
    kind: "system",
    keys: [["_id", 1]],
    exception: "mongodb_builtin_id"
  },
  {
    collection: "tenant_audit_logs",
    name: "tenant_audit_timeline",
    tenantOwned: true,
    kind: "query",
    keys: [
      ["tenantId", 1],
      ["createdAt", -1],
      ["_id", 1]
    ]
  },
  {
    collection: "invites",
    name: "tenant_recipient_pending_unique",
    tenantOwned: true,
    kind: "unique",
    keys: [
      ["tenantId", 1],
      ["recipient.kind", 1],
      ["recipient.value", 1]
    ],
    partialFilterExpression: { status: "pending" }
  }
] as const satisfies readonly ApplicationIndexDefinition[];

export const phase3DocumentShapeV2 = {
  tenants: ["ownerGuardVersion"],
  invites: ["schemaVersion:2", "acceptedByUserId"],
  authIdentities: ["userId", "normalizedEmail", "passwordHash", "status", "verifiedAt"],
  sessions: [
    "userId",
    "familyId",
    "currentRefreshDigest",
    "csrfDigest",
    "activeTenantId",
    "idleExpiresAt",
    "absoluteExpiresAt",
    "revokedAt",
    "reuseDetectedAt"
  ],
  refreshHistory: ["sessionId", "familyId", "tokenDigest", "expiresAt"],
  challenges: [
    "publicId",
    "purpose",
    "payloadVersion",
    "subjectKeyVersion",
    "subjectDigest",
    "tokenDigest",
    "failedAttempts",
    "expiresAt",
    "consumedAt"
  ],
  rateLimits: ["keyDigest", "windowStartedAt", "count", "expiresAt"],
  directory: ["userId", "entries"],
  securityEvents: ["eventType", "subjectDigest", "outcome", "createdAt"],
  tenantAudit: ["tenantId", "actorUserId", "action", "targetType", "targetId", "createdAt"]
} as const;
