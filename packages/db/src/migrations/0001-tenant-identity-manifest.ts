import type { ApplicationIndexDefinition } from "../indexes/index-policy";

export const tenantIdentityCollectionNames = [
  "tenants",
  "users",
  "locations",
  "memberships",
  "invites"
] as const;

/**
 * Immutable index specification owned by migration 0001.
 * Later migrations must add new manifests rather than editing this one.
 */
export const tenantIdentityIndexManifest = [
  {
    collection: "tenants",
    name: "_id_",
    tenantOwned: false,
    kind: "system",
    keys: [["_id", 1]],
    exception: "mongodb_builtin_id"
  },
  {
    collection: "users",
    name: "_id_",
    tenantOwned: false,
    kind: "system",
    keys: [["_id", 1]],
    exception: "mongodb_builtin_id"
  },
  {
    collection: "locations",
    name: "_id_",
    tenantOwned: true,
    kind: "system",
    keys: [["_id", 1]],
    exception: "mongodb_builtin_id"
  },
  {
    collection: "locations",
    name: "tenant_location_list",
    tenantOwned: true,
    kind: "query",
    keys: [
      ["tenantId", 1],
      ["deletedAt", 1],
      ["status", 1],
      ["name", 1],
      ["_id", 1]
    ]
  },
  {
    collection: "memberships",
    name: "_id_",
    tenantOwned: true,
    kind: "system",
    keys: [["_id", 1]],
    exception: "mongodb_builtin_id"
  },
  {
    collection: "memberships",
    name: "tenant_user_unique",
    tenantOwned: true,
    kind: "unique",
    keys: [
      ["tenantId", 1],
      ["userId", 1]
    ]
  },
  {
    collection: "memberships",
    name: "tenant_membership_list",
    tenantOwned: true,
    kind: "query",
    keys: [
      ["tenantId", 1],
      ["deletedAt", 1],
      ["status", 1],
      ["createdAt", -1],
      ["_id", 1]
    ]
  },
  {
    collection: "invites",
    name: "_id_",
    tenantOwned: true,
    kind: "system",
    keys: [["_id", 1]],
    exception: "mongodb_builtin_id"
  },
  {
    collection: "invites",
    name: "tenant_invite_list",
    tenantOwned: true,
    kind: "query",
    keys: [
      ["tenantId", 1],
      ["status", 1],
      ["createdAt", -1],
      ["_id", 1]
    ]
  },
  {
    collection: "invites",
    name: "tenant_recipient_pending",
    tenantOwned: true,
    kind: "query",
    keys: [
      ["tenantId", 1],
      ["recipient.kind", 1],
      ["recipient.value", 1],
      ["status", 1],
      ["createdAt", -1],
      ["_id", 1],
      ["expiresAt", 1]
    ]
  },
  {
    collection: "invites",
    name: "expires_at_ttl",
    tenantOwned: true,
    kind: "ttl",
    keys: [["expiresAt", 1]],
    expireAfterSeconds: 0,
    exception: "tenant_ttl_index",
    exceptionReason:
      "Invites are ephemeral in every lifecycle state; MongoDB requires a single-field TTL index."
  }
] as const satisfies readonly ApplicationIndexDefinition[];

export const tenantIdentityDocumentShapeV1 = {
  roles: ["owner", "manager", "receptionist", "stylist"],
  tenants: ["schemaVersion", "name", "defaultLocationId", "status", "deletedAt"],
  users: ["schemaVersion", "displayName", "normalizedEmail", "phone", "status", "deletedAt"],
  locations: ["schemaVersion", "tenantId", "name", "timezone", "status", "deletedAt"],
  memberships: [
    "schemaVersion",
    "tenantId",
    "userId",
    "roleKeys",
    "status",
    "joinedAt",
    "revokedAt",
    "deletedAt"
  ],
  invites: [
    "schemaVersion",
    "tenantId",
    "recipient",
    "roleKeys",
    "tokenDigest",
    "status",
    "expiresAt",
    "acceptedAt",
    "revokedAt"
  ]
} as const;
