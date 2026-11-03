import type { IndexDirection } from "../indexes/index-policy";
import type { Types } from "mongoose";
import {
  phase3CollectionNames,
  phase3DocumentShapeV2,
  phase3IndexManifest
} from "./0002-auth-tenancy-manifest";
import type { Migration } from "./types";

export const phase3ChecksumMaterial = JSON.stringify({
  schemaVersion: 2,
  collections: phase3CollectionNames,
  documentShape: phase3DocumentShapeV2,
  indexes: phase3IndexManifest,
  backfill:
    "preflight-legacy-accepted-and-live-duplicates;expire-pending;invite-v2;active-membership-directory"
});

interface BackfillMembership {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  roleKeys: unknown;
  status: string;
  deletedAt: Date | null;
}

function keyDocument(keys: readonly (readonly [string, IndexDirection])[]): Record<string, 1 | -1> {
  return Object.fromEntries(keys) as Record<string, 1 | -1>;
}

export const addAuthTenancyRbacMigration: Migration = {
  id: "0002_add_auth_tenancy_rbac",
  name: "Add authentication, session, directory and audit persistence",
  checksumMaterial: phase3ChecksumMaterial,
  async up({ database }) {
    const migrationTime = new Date();
    const invites = database.collection("invites");
    const acceptedWithoutActor = await invites.countDocuments({
      status: "accepted",
      $or: [{ acceptedByUserId: { $exists: false } }, { acceptedByUserId: null }]
    });
    const liveDuplicateGroups = await invites
      .aggregate<{ count: number }>([
        { $match: { status: "pending", expiresAt: { $gt: migrationTime } } },
        {
          $group: {
            _id: { tenantId: "$tenantId", kind: "$recipient.kind", value: "$recipient.value" },
            count: { $sum: 1 }
          }
        },
        { $match: { count: { $gt: 1 } } },
        { $count: "count" }
      ])
      .next();
    const duplicateLivePending = liveDuplicateGroups?.count ?? 0;
    if (acceptedWithoutActor !== 0 || duplicateLivePending !== 0) {
      throw new Error(
        `Phase 3 preflight failed: acceptedWithoutActor=${acceptedWithoutActor}; duplicateLivePendingGroups=${duplicateLivePending}`
      );
    }
    const existingCollections = new Set(
      (await database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name)
    );

    for (const collectionName of phase3CollectionNames) {
      if (!existingCollections.has(collectionName)) await database.createCollection(collectionName);
    }
    await database
      .collection("tenants")
      .updateMany({ ownerGuardVersion: { $exists: false } }, { $set: { ownerGuardVersion: 0 } });
    await invites.updateMany(
      { status: "pending", expiresAt: { $lte: migrationTime } },
      {
        $set: {
          status: "revoked",
          revokedAt: migrationTime,
          schemaVersion: 2,
          acceptedByUserId: null
        }
      }
    );

    await invites.updateMany(
      {
        status: { $in: ["pending", "revoked"] },
        $or: [{ schemaVersion: { $ne: 2 } }, { acceptedByUserId: { $exists: false } }]
      },
      { $set: { schemaVersion: 2, acceptedByUserId: null } }
    );
    await invites.updateMany(
      { status: "accepted", schemaVersion: { $ne: 2 }, acceptedByUserId: { $ne: null } },
      { $set: { schemaVersion: 2 } }
    );

    const directory = database.collection("user_tenant_directory");
    const activeMemberships = await database
      .collection<BackfillMembership>("memberships")
      .find({ status: "active", deletedAt: null })
      .sort({ userId: 1, tenantId: 1 })
      .toArray();
    const byUser = new Map<
      string,
      {
        userId: Types.ObjectId;
        entries: Array<{
          tenantId: Types.ObjectId;
          membershipId: Types.ObjectId;
          roleKeys: unknown;
          status: "active";
        }>;
      }
    >();
    for (const membership of activeMemberships) {
      const key = String(membership.userId);
      const row = byUser.get(key) ?? {
        userId: membership.userId,
        entries: []
      };
      row.entries.push({
        tenantId: membership.tenantId,
        membershipId: membership._id,
        roleKeys: Array.isArray(membership.roleKeys) ? membership.roleKeys : [],
        status: "active"
      });
      byUser.set(key, row);
    }
    for (const row of byUser.values()) {
      await directory.updateOne(
        { userId: row.userId },
        {
          $set: { schemaVersion: 1, entries: row.entries, updatedAt: migrationTime },
          $setOnInsert: { createdAt: migrationTime }
        },
        { upsert: true }
      );
    }

    for (const index of phase3IndexManifest) {
      if (index.kind === "system") continue;
      await database.collection(index.collection).createIndex(keyDocument(index.keys), {
        name: index.name,
        ...(index.kind === "unique" ? { unique: true } : {}),
        ...(index.kind === "ttl" ? { expireAfterSeconds: index.expireAfterSeconds } : {}),
        ...("partialFilterExpression" in index
          ? { partialFilterExpression: index.partialFilterExpression }
          : {})
      });
    }

    const malformed = await invites.countDocuments({
      $or: [{ schemaVersion: { $ne: 2 } }, { acceptedByUserId: { $exists: false } }]
    });
    if (malformed !== 0) throw new Error("Phase 3 invite postflight failed");
  }
};
