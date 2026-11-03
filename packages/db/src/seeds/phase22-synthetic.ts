import { createHash } from "node:crypto";

import { Types } from "mongoose";

import { getInternalDatabaseConnection } from "../connection";
import {
  InviteModel,
  LocationModel,
  MembershipModel,
  TenantModel,
  UserModel
} from "../models/identity-models";

const ids = {
  user: new Types.ObjectId("650000000000000000000001"),
  tenantA: new Types.ObjectId("650000000000000000000011"),
  tenantB: new Types.ObjectId("650000000000000000000012"),
  locationA: new Types.ObjectId("650000000000000000000021"),
  locationB: new Types.ObjectId("650000000000000000000022"),
  membershipA: new Types.ObjectId("650000000000000000000031"),
  membershipB: new Types.ObjectId("650000000000000000000032"),
  inviteA: new Types.ObjectId("650000000000000000000041"),
  inviteB: new Types.ObjectId("650000000000000000000042")
} as const;

const originalExpiry = new Date("2099-01-01T00:00:00.000Z");

export interface SyntheticSeedCounts {
  readonly tenants: number;
  readonly locations: number;
  readonly users: number;
  readonly memberships: number;
  readonly invites: number;
}

export function assertSyntheticSeedAllowed(environment: NodeJS.ProcessEnv): void {
  if (environment.ZURIDESK_ALLOW_SYNTHETIC_SEED !== "true") {
    throw new Error("Set ZURIDESK_ALLOW_SYNTHETIC_SEED=true to run the synthetic seed");
  }
  if (environment.NODE_ENV === "production") {
    throw new Error("Synthetic seed execution is forbidden in production mode");
  }
  const databaseName = environment.MONGODB_DB_NAME?.trim() ?? "";
  if (!/^zuridesk_(?:dev|test)(?:_[a-z0-9]+)*$/.test(databaseName)) {
    throw new Error(
      "Synthetic seed database must use an approved zuridesk_dev or zuridesk_test name"
    );
  }
}

function digest(label: string): string {
  return createHash("sha256").update(label).digest("hex");
}

export async function seedPhase22SyntheticFixtures(): Promise<SyntheticSeedCounts> {
  await getInternalDatabaseConnection().transaction(async (session) => {
    const commonOptions = { upsert: true, runValidators: true, session, setDefaultsOnInsert: true };

    await UserModel.updateOne(
      { _id: ids.user },
      {
        $setOnInsert: {
          schemaVersion: 1,
          displayName: "ZuriDesk Demo Owner",
          normalizedEmail: "owner@zuridesk.example",
          phone: "+254700000001",
          status: "active",
          deletedAt: null
        }
      },
      commonOptions
    );

    await TenantModel.updateOne(
      { _id: ids.tenantA },
      {
        $setOnInsert: {
          schemaVersion: 1,
          name: "ZuriDesk Demo Salon A",
          defaultLocationId: ids.locationA,
          status: "active",
          deletedAt: null
        }
      },
      commonOptions
    );
    await TenantModel.updateOne(
      { _id: ids.tenantB },
      {
        $setOnInsert: {
          schemaVersion: 1,
          name: "ZuriDesk Demo Salon B",
          defaultLocationId: ids.locationB,
          status: "active",
          deletedAt: null
        }
      },
      commonOptions
    );

    await LocationModel.updateOne(
      { _id: ids.locationA },
      {
        $setOnInsert: {
          schemaVersion: 1,
          tenantId: ids.tenantA,
          name: "Demo Branch A",
          timezone: "Africa/Nairobi",
          status: "active",
          deletedAt: null
        }
      },
      commonOptions
    );
    await LocationModel.updateOne(
      { _id: ids.locationB },
      {
        $setOnInsert: {
          schemaVersion: 1,
          tenantId: ids.tenantB,
          name: "Demo Branch B",
          timezone: "Africa/Nairobi",
          status: "active",
          deletedAt: null
        }
      },
      commonOptions
    );

    await MembershipModel.updateOne(
      { _id: ids.membershipA },
      {
        $setOnInsert: {
          schemaVersion: 1,
          tenantId: ids.tenantA,
          userId: ids.user,
          roleKeys: ["owner"],
          status: "active",
          joinedAt: new Date("2026-10-01T00:00:00.000Z"),
          revokedAt: null,
          deletedAt: null
        }
      },
      commonOptions
    );
    await MembershipModel.updateOne(
      { _id: ids.membershipB },
      {
        $setOnInsert: {
          schemaVersion: 1,
          tenantId: ids.tenantB,
          userId: ids.user,
          roleKeys: ["owner"],
          status: "active",
          joinedAt: new Date("2026-10-01T00:00:00.000Z"),
          revokedAt: null,
          deletedAt: null
        }
      },
      commonOptions
    );

    await InviteModel.updateOne(
      { _id: ids.inviteA },
      {
        $setOnInsert: {
          schemaVersion: 2,
          tenantId: ids.tenantA,
          recipient: { kind: "email", value: "invite-a@zuridesk.example" },
          roleKeys: ["stylist"],
          tokenDigest: digest("zuridesk-synthetic-invite-a"),
          status: "pending",
          expiresAt: originalExpiry,
          acceptedAt: null,
          acceptedByUserId: null,
          revokedAt: null
        }
      },
      commonOptions
    );
    await InviteModel.updateOne(
      { _id: ids.inviteB },
      {
        $setOnInsert: {
          schemaVersion: 2,
          tenantId: ids.tenantB,
          recipient: { kind: "email", value: "invite-b@zuridesk.example" },
          roleKeys: ["receptionist"],
          tokenDigest: digest("zuridesk-synthetic-invite-b"),
          status: "pending",
          expiresAt: originalExpiry,
          acceptedAt: null,
          acceptedByUserId: null,
          revokedAt: null
        }
      },
      commonOptions
    );
  });

  const [tenants, locations, users, memberships, invites] = await Promise.all([
    TenantModel.countDocuments({ _id: { $in: [ids.tenantA, ids.tenantB] } }),
    LocationModel.countDocuments({ _id: { $in: [ids.locationA, ids.locationB] } }),
    UserModel.countDocuments({ _id: ids.user }),
    MembershipModel.countDocuments({ _id: { $in: [ids.membershipA, ids.membershipB] } }),
    InviteModel.countDocuments({ _id: { $in: [ids.inviteA, ids.inviteB] } })
  ]);
  return { tenants, locations, users, memberships, invites };
}
