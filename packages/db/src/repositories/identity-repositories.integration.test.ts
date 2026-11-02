import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";

import { connectDatabase, disconnectDatabase, getInternalDatabase } from "../connection";
import type { TrustedTenantContext } from "../context/tenant-context";
import { migrations } from "../migrations/registry";
import { runMigrations } from "../migrations/runner";
import { InviteModel, LocationModel, MembershipModel } from "../models/identity-models";
import { inviteRepository } from "./invite-repository";
import { locationRepository, type UpdateLocationInput } from "./location-repository";
import { membershipRepository, verifyCandidateTenantMembership } from "./membership-repository";
import { bootstrapTenantIdentity, currentTenantRepository } from "./tenant-repository";
import { userRepository } from "./user-repository";

const uri = process.env.TEST_MONGODB_URI;
const databaseName = `zuridesk_test_isolation_${randomUUID().replaceAll("-", "")}`;
const digestA = "a".repeat(64);
const digestB = "b".repeat(64);

function newId(): string {
  return new Types.ObjectId().toHexString();
}

describe.skipIf(uri === undefined)("tenant identity repository isolation", () => {
  let tenantAId: string;
  let tenantBId: string;
  let defaultLocationAId: string;
  let defaultLocationBId: string;
  let ownerId: string;
  let contextA: TrustedTenantContext;
  let contextB: TrustedTenantContext;

  beforeAll(async () => {
    await connectDatabase({ uri: uri!, databaseName });
  });

  beforeEach(async () => {
    await getInternalDatabase().dropDatabase();
    await runMigrations(getInternalDatabase(), migrations);

    tenantAId = newId();
    tenantBId = newId();
    defaultLocationAId = newId();
    defaultLocationBId = newId();
    ownerId = newId();
    await userRepository.create({
      id: ownerId,
      displayName: "Shared Owner",
      normalizedEmail: "owner@isolation.example"
    });
    await bootstrapTenantIdentity({
      tenantId: tenantAId,
      locationId: defaultLocationAId,
      membershipId: newId(),
      userId: ownerId,
      tenantName: "Tenant A",
      locationName: "Default A"
    });
    await bootstrapTenantIdentity({
      tenantId: tenantBId,
      locationId: defaultLocationBId,
      membershipId: newId(),
      userId: ownerId,
      tenantName: "Tenant B",
      locationName: "Default B"
    });
    contextA = (await verifyCandidateTenantMembership({
      tenantId: tenantAId,
      authenticatedUserId: ownerId,
      requestId: "test-a"
    }))!;
    contextB = (await verifyCandidateTenantMembership({
      tenantId: tenantBId,
      authenticatedUserId: ownerId,
      requestId: "test-b"
    }))!;
  });

  afterAll(async () => {
    await getInternalDatabase().dropDatabase();
    await disconnectDatabase();
  });

  it("scopes every location operation and ignores injected ownership fields", async () => {
    const locationA = await locationRepository.create(contextA, {
      name: "A branch",
      status: "inactive"
    });
    const locationB = await locationRepository.create(contextB, { name: "B branch" });

    await expect(locationRepository.findById(contextA, locationB.id)).resolves.toBeNull();
    await expect(locationRepository.countByStatus(contextA, "inactive")).resolves.toBe(1);
    await expect(locationRepository.listByStatus(contextA, "inactive")).resolves.toEqual([
      expect.objectContaining({ id: locationA.id, tenantId: tenantAId })
    ]);
    await expect(
      locationRepository.update(contextA, locationB.id, { name: "stolen" })
    ).resolves.toBeNull();
    await expect(locationRepository.archive(contextA, locationB.id)).resolves.toBeNull();
    await expect(locationRepository.restore(contextA, locationB.id)).resolves.toBeNull();

    const injectedPatch = {
      name: "Still A",
      tenantId: tenantBId
    } as UpdateLocationInput;
    const updated = await locationRepository.update(contextA, locationA.id, injectedPatch);
    expect(updated).toMatchObject({ name: "Still A", tenantId: tenantAId });

    await locationRepository.update(contextA, locationA.id, { status: "active" });
    const archived = await locationRepository.archive(contextA, locationA.id);
    expect(archived).toMatchObject({ status: "inactive", tenantId: tenantAId });
    expect(await locationRepository.findById(contextA, locationA.id)).toBeNull();
    const restored = await locationRepository.restore(contextA, locationA.id);
    expect(restored).toMatchObject({ status: "active", deletedAt: null });
  });

  it("scopes every membership operation and starts the user join with a tenant match", async () => {
    const userA = await userRepository.create({ id: newId(), displayName: "A staff" });
    const userB = await userRepository.create({ id: newId(), displayName: "B staff" });
    const membershipA = await membershipRepository.create(contextA, {
      userId: userA.id,
      roleKeys: ["stylist"]
    });
    const membershipB = await membershipRepository.create(contextB, {
      userId: userB.id,
      roleKeys: ["receptionist"]
    });

    await expect(membershipRepository.findByUser(contextA, userB.id)).resolves.toBeNull();
    await expect(membershipRepository.countByStatus(contextA, "active")).resolves.toBe(2);
    expect(
      (await membershipRepository.listByStatus(contextA, "active")).map(({ tenantId }) => tenantId)
    ).toEqual([tenantAId, tenantAId]);
    const joined = await membershipRepository.listWithUsersByStatus(contextA, "active");
    expect(joined.every(({ membership }) => membership.tenantId === tenantAId)).toBe(true);
    expect(joined.some(({ user }) => user?.id === userB.id)).toBe(false);

    await expect(
      membershipRepository.updateRoles(contextA, membershipB.id, ["manager"])
    ).resolves.toBeNull();
    await expect(
      membershipRepository.updateStatus(contextA, membershipB.id, "suspended")
    ).resolves.toBeNull();
    await expect(membershipRepository.revoke(contextA, membershipB.id)).resolves.toBeNull();
    await expect(membershipRepository.restore(contextA, membershipB.id)).resolves.toBeNull();

    expect(
      await membershipRepository.updateRoles(contextA, membershipA.id, ["manager"])
    ).toMatchObject({
      roleKeys: ["manager"]
    });
    expect(
      await membershipRepository.updateStatus(contextA, membershipA.id, "suspended")
    ).toMatchObject({
      status: "suspended"
    });
    expect(await membershipRepository.revoke(contextA, membershipA.id)).toMatchObject({
      status: "revoked"
    });
    expect(await membershipRepository.restore(contextA, membershipA.id)).toMatchObject({
      status: "active",
      revokedAt: null
    });

    await expect(
      verifyCandidateTenantMembership({
        tenantId: tenantAId,
        authenticatedUserId: userB.id,
        requestId: "wrong-tenant"
      })
    ).resolves.toBeNull();
  });

  it("scopes every invite operation, never returns its digest, and rejects expired rows before TTL", async () => {
    const future = new Date(Date.now() + 3_600_000);
    const inviteA = await inviteRepository.create(contextA, {
      recipient: { kind: "email", value: " Staff-A@Example.COM " },
      roleKeys: ["stylist"],
      tokenDigest: digestA,
      expiresAt: future
    });
    const inviteB = await inviteRepository.create(contextB, {
      recipient: { kind: "phone", value: "+254700000002" },
      roleKeys: ["receptionist"],
      tokenDigest: digestB,
      expiresAt: future
    });

    expect(inviteA.recipient.value).toBe("staff-a@example.com");
    expect("tokenDigest" in inviteA).toBe(false);
    await expect(inviteRepository.findById(contextA, inviteB.id)).resolves.toBeNull();
    await expect(
      inviteRepository.findPendingByRecipient(contextA, inviteB.recipient)
    ).resolves.toBeNull();
    await expect(inviteRepository.countByStatus(contextA, "pending")).resolves.toBe(1);
    await expect(inviteRepository.listPending(contextA)).resolves.toEqual([
      expect.objectContaining({ id: inviteA.id, tenantId: tenantAId })
    ]);
    await expect(inviteRepository.listByStatus(contextA, "pending")).resolves.toHaveLength(1);
    await expect(inviteRepository.revoke(contextA, inviteB.id)).resolves.toBeNull();
    await expect(inviteRepository.revoke(contextA, inviteA.id)).resolves.toMatchObject({
      status: "revoked"
    });

    const expiredId = new Types.ObjectId();
    await getInternalDatabase()
      .collection("invites")
      .insertOne({
        _id: expiredId,
        schemaVersion: 1,
        tenantId: new Types.ObjectId(tenantAId),
        recipient: { kind: "email", value: "expired@example.com" },
        roleKeys: ["stylist"],
        tokenDigest: "c".repeat(64),
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000),
        acceptedAt: null,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    await expect(inviteRepository.findById(contextA, expiredId.toHexString())).resolves.toBeNull();
    await expect(
      inviteRepository.findPendingByRecipient(contextA, {
        kind: "email",
        value: "expired@example.com"
      })
    ).resolves.toBeNull();
    expect(
      await getInternalDatabase().collection("invites").findOne({ _id: expiredId })
    ).not.toBeNull();
  });

  it("protects the default-location invariant across tenant boundaries, rollback, and races", async () => {
    expect(await currentTenantRepository.get(contextA)).toMatchObject({ id: tenantAId });
    await expect(
      currentTenantRepository.setDefaultLocation(contextA, defaultLocationBId)
    ).rejects.toThrow("current tenant");
    await expect(locationRepository.archive(contextA, defaultLocationAId)).rejects.toThrow(
      "default location"
    );
    await expect(
      locationRepository.update(contextA, defaultLocationAId, { status: "inactive" })
    ).rejects.toThrow("default location");

    const duplicateLocationTenantId = newId();
    await expect(
      bootstrapTenantIdentity({
        tenantId: duplicateLocationTenantId,
        locationId: defaultLocationAId,
        membershipId: newId(),
        userId: ownerId,
        tenantName: "Must roll back",
        locationName: "Duplicate"
      })
    ).rejects.toThrow();
    expect(
      await getInternalDatabase()
        .collection("tenants")
        .findOne({
          _id: new Types.ObjectId(duplicateLocationTenantId)
        })
    ).toBeNull();

    const raceLocation = await locationRepository.create(contextA, { name: "Race branch" });
    const outcomes = await Promise.allSettled([
      currentTenantRepository.setDefaultLocation(contextA, raceLocation.id),
      locationRepository.update(contextA, raceLocation.id, { status: "inactive" })
    ]);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);

    const tenant = await currentTenantRepository.get(contextA);
    const defaultLocation = await locationRepository.findById(contextA, tenant!.defaultLocationId);
    expect(defaultLocation).toMatchObject({ status: "active", deletedAt: null });
  });

  it("rejects forged contexts and injection-shaped identifiers and returns detached DTOs", async () => {
    const forged = {
      tenantId: tenantAId,
      userId: ownerId,
      requestId: "forged"
    } as TrustedTenantContext;
    await expect(currentTenantRepository.get(forged)).rejects.toThrow("trusted tenant context");
    await expect(locationRepository.countByStatus(forged, "active")).rejects.toThrow(
      "trusted tenant context"
    );
    await expect(membershipRepository.countByStatus(forged, "active")).rejects.toThrow(
      "trusted tenant context"
    );
    await expect(inviteRepository.countByStatus(forged, "pending")).rejects.toThrow(
      "trusted tenant context"
    );

    const cloned = { ...contextA, tenantId: tenantBId } as TrustedTenantContext;
    await expect(locationRepository.countByStatus(cloned, "active")).rejects.toThrow(
      "trusted tenant context"
    );

    await expect(
      locationRepository.findById(contextA, { $ne: null } as unknown as string)
    ).rejects.toThrow("ObjectId string");
    await expect(
      membershipRepository.findByUser(contextA, { $gt: "" } as unknown as string)
    ).rejects.toThrow("ObjectId string");

    const dto = await locationRepository.findById(contextA, defaultLocationAId);
    expect(dto).not.toBeNull();
    expect(Object.getPrototypeOf(dto)).toBe(Object.prototype);
    expect("save" in dto!).toBe(false);
    expect("$__" in dto!).toBe(false);
  });

  it("records actual winning query plans without forced hints", async () => {
    const tenantId = new Types.ObjectId(tenantAId);
    const locationExplain = await LocationModel.find({
      tenantId,
      deletedAt: null,
      status: "active"
    })
      .sort({ name: 1, _id: 1 })
      .explain("executionStats");
    const membershipExplain = await MembershipModel.find({
      tenantId,
      deletedAt: null,
      status: "active"
    })
      .sort({ createdAt: -1, _id: 1 })
      .explain("executionStats");
    const inviteExplain = await InviteModel.find({
      tenantId,
      "recipient.kind": "email",
      "recipient.value": "missing@example.com",
      status: "pending",
      expiresAt: { $gt: new Date() }
    })
      .sort({ createdAt: -1, _id: 1 })
      .explain("executionStats");
    const membershipAggregationExplain = await MembershipModel.aggregate([
      { $match: { tenantId, deletedAt: null, status: "active" } },
      { $sort: { createdAt: -1, _id: 1 } },
      { $limit: 100 },
      {
        $lookup: {
          from: "users",
          let: { joinedUserId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$joinedUserId"] },
                deletedAt: null
              }
            }
          ],
          as: "joinedUser"
        }
      }
    ]).explain("executionStats");

    const winningPlan = (explain: unknown): string => {
      const typedExplain = explain as { queryPlanner?: { winningPlan?: unknown } };
      return JSON.stringify(typedExplain.queryPlanner?.winningPlan);
    };
    expect(winningPlan(locationExplain)).toContain("tenant_location_list");
    expect(winningPlan(membershipExplain)).toContain("tenant_membership_list");
    expect(winningPlan(inviteExplain)).toContain("tenant_recipient_pending");
    const typedAggregationExplain = membershipAggregationExplain as unknown as {
      stages?: Array<{ $cursor?: { queryPlanner?: { winningPlan?: unknown } } }>;
    };
    const [firstAggregationStage] = typedAggregationExplain.stages ?? [];
    expect(JSON.stringify(firstAggregationStage?.$cursor?.queryPlanner?.winningPlan)).toContain(
      "tenant_membership_list"
    );
  });
});
