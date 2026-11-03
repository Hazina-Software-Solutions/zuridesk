import type { ClientSession } from "mongoose";
import { Types } from "mongoose";

import { getInternalDatabase, getInternalDatabaseConnection } from "../connection";
import { migrations } from "../migrations/registry";
import { getMigrationStatus } from "../migrations/runner";
import {
  InviteModel,
  LocationModel,
  MembershipModel,
  TenantModel,
  UserModel
} from "../models/identity-models";
import {
  AuthIdentityModel,
  AuthSessionModel,
  RefreshTokenHistoryModel,
  UserTenantDirectoryModel
} from "../models/phase3-models";
import {
  LocationAccessGrantModel,
  ScheduleGuardModel,
  ServiceLocationOfferingModel,
  ServiceModel,
  StaffBookingProfileModel,
  StaffLocationAssignmentModel,
  StaffServiceEligibilityModel,
  WeeklyScheduleVersionModel
} from "../models/phase4-models";

export const DEVELOPMENT_DEMO_DATASET_VERSION = 1;

export const DEVELOPMENT_DEMO_PERSONAS = [
  {
    key: "owner",
    email: "owner@demo.zuridesk.example",
    displayName: "Demo Owner",
    roleKeys: ["owner"]
  },
  {
    key: "manager",
    email: "manager@demo.zuridesk.example",
    displayName: "Demo Manager",
    roleKeys: ["manager"]
  },
  {
    key: "receptionist",
    email: "reception@demo.zuridesk.example",
    displayName: "Demo Receptionist",
    roleKeys: ["receptionist"]
  },
  {
    key: "stylistA",
    email: "stylist.a@demo.zuridesk.example",
    displayName: "Demo Stylist A",
    roleKeys: ["stylist"]
  },
  {
    key: "stylistB",
    email: "stylist.b@demo.zuridesk.example",
    displayName: "Demo Stylist B",
    roleKeys: ["stylist"]
  }
] as const;

export type DevelopmentDemoPersonaKey = (typeof DEVELOPMENT_DEMO_PERSONAS)[number]["key"];

export type DevelopmentDemoPasswordHashes = Readonly<Record<DevelopmentDemoPersonaKey, string>>;

export interface DevelopmentDemoSeedResult {
  readonly datasetVersion: number;
  readonly tenants: number;
  readonly locations: number;
  readonly users: number;
  readonly memberships: number;
  readonly services: number;
  readonly staffProfiles: number;
  readonly offerings: number;
}

export const DEVELOPMENT_DEMO_IDS = {
  tenant: new Types.ObjectId("660000000000000000000001"),
  location: new Types.ObjectId("660000000000000000000011"),
  users: {
    owner: new Types.ObjectId("660000000000000000000101"),
    manager: new Types.ObjectId("660000000000000000000102"),
    receptionist: new Types.ObjectId("660000000000000000000103"),
    stylistA: new Types.ObjectId("660000000000000000000104"),
    stylistB: new Types.ObjectId("660000000000000000000105")
  },
  identities: {
    owner: new Types.ObjectId("660000000000000000000301"),
    manager: new Types.ObjectId("660000000000000000000302"),
    receptionist: new Types.ObjectId("660000000000000000000303"),
    stylistA: new Types.ObjectId("660000000000000000000304"),
    stylistB: new Types.ObjectId("660000000000000000000305")
  },
  memberships: {
    owner: new Types.ObjectId("660000000000000000000201"),
    manager: new Types.ObjectId("660000000000000000000202"),
    receptionist: new Types.ObjectId("660000000000000000000203"),
    stylistA: new Types.ObjectId("660000000000000000000204"),
    stylistB: new Types.ObjectId("660000000000000000000205")
  },
  directories: {
    owner: new Types.ObjectId("660000000000000000000401"),
    manager: new Types.ObjectId("660000000000000000000402"),
    receptionist: new Types.ObjectId("660000000000000000000403"),
    stylistA: new Types.ObjectId("660000000000000000000404"),
    stylistB: new Types.ObjectId("660000000000000000000405")
  },
  staffProfiles: {
    stylistA: new Types.ObjectId("660000000000000000000501"),
    stylistB: new Types.ObjectId("660000000000000000000502")
  },
  services: {
    braids: new Types.ObjectId("660000000000000000000601"),
    manicure: new Types.ObjectId("660000000000000000000602"),
    washAndStyle: new Types.ObjectId("660000000000000000000603")
  },
  grants: {
    manager: new Types.ObjectId("660000000000000000000701"),
    receptionist: new Types.ObjectId("660000000000000000000702")
  },
  assignments: {
    stylistA: new Types.ObjectId("660000000000000000000801"),
    stylistB: new Types.ObjectId("660000000000000000000802")
  },
  eligibilities: {
    stylistABraids: new Types.ObjectId("660000000000000000000901"),
    stylistAManicure: new Types.ObjectId("660000000000000000000902"),
    stylistAWashAndStyle: new Types.ObjectId("660000000000000000000903"),
    stylistBBraids: new Types.ObjectId("660000000000000000000904"),
    stylistBWashAndStyle: new Types.ObjectId("660000000000000000000905")
  },
  offerings: {
    braids: new Types.ObjectId("660000000000000000000a01"),
    manicure: new Types.ObjectId("660000000000000000000a02"),
    washAndStyle: new Types.ObjectId("660000000000000000000a03")
  },
  schedules: {
    location: new Types.ObjectId("660000000000000000000b01"),
    stylistB: new Types.ObjectId("660000000000000000000b02")
  },
  guards: {
    location: new Types.ObjectId("660000000000000000000c01"),
    stylistA: new Types.ObjectId("660000000000000000000c02"),
    stylistB: new Types.ObjectId("660000000000000000000c03")
  }
} as const;

const seededAt = new Date("2026-01-01T00:00:00.000Z");
const timezone = "Africa/Nairobi";
const locationWeek = [
  { weekday: 0, intervals: [] },
  { weekday: 1, intervals: [{ startMinute: 480, endMinute: 1_080 }] },
  { weekday: 2, intervals: [{ startMinute: 480, endMinute: 1_080 }] },
  { weekday: 3, intervals: [{ startMinute: 480, endMinute: 1_080 }] },
  { weekday: 4, intervals: [{ startMinute: 480, endMinute: 1_080 }] },
  { weekday: 5, intervals: [{ startMinute: 480, endMinute: 1_080 }] },
  { weekday: 6, intervals: [{ startMinute: 480, endMinute: 1_020 }] }
] as const;
const stylistBWeek = [
  { weekday: 0, intervals: [] },
  {
    weekday: 1,
    intervals: [
      { startMinute: 540, endMinute: 780 },
      { startMinute: 840, endMinute: 1_020 }
    ]
  },
  {
    weekday: 2,
    intervals: [
      { startMinute: 540, endMinute: 780 },
      { startMinute: 840, endMinute: 1_020 }
    ]
  },
  {
    weekday: 3,
    intervals: [
      { startMinute: 540, endMinute: 780 },
      { startMinute: 840, endMinute: 1_020 }
    ]
  },
  {
    weekday: 4,
    intervals: [
      { startMinute: 540, endMinute: 780 },
      { startMinute: 840, endMinute: 1_020 }
    ]
  },
  {
    weekday: 5,
    intervals: [
      { startMinute: 540, endMinute: 780 },
      { startMinute: 840, endMinute: 1_020 }
    ]
  },
  { weekday: 6, intervals: [{ startMinute: 540, endMinute: 840 }] }
] as const;

export function assertDevelopmentDemoSeedAllowed(environment: NodeJS.ProcessEnv): void {
  if (environment.ZURIDESK_ALLOW_DEMO_SEED !== "true") {
    throw new Error("Set ZURIDESK_ALLOW_DEMO_SEED=true to run the development demo seed");
  }
  if (environment.NODE_ENV === "production") {
    throw new Error("Development demo seed execution is forbidden in production mode");
  }
  const databaseName = environment.MONGODB_DB_NAME?.trim() ?? "";
  if (!/^zuridesk_(?:dev|test)(?:_[a-z0-9]+)*$/.test(databaseName)) {
    throw new Error(
      "Development demo database must use an approved zuridesk_dev or zuridesk_test name"
    );
  }
}

function assertPasswordHashes(passwordHashes: DevelopmentDemoPasswordHashes): void {
  for (const persona of DEVELOPMENT_DEMO_PERSONAS) {
    if (!passwordHashes[persona.key].startsWith("$argon2id$")) {
      throw new Error(`Development demo password hash for ${persona.key} must use Argon2id`);
    }
  }
}

async function assertMigrationsApplied(): Promise<void> {
  const status = await getMigrationStatus(getInternalDatabase(), migrations);
  const pending = status.filter((entry) => entry.state === "pending");
  if (pending.length > 0) {
    throw new Error("Apply every registered migration before running the development demo seed");
  }
}

async function clearDemoSessions(session: ClientSession): Promise<void> {
  const userIds = Object.values(DEVELOPMENT_DEMO_IDS.users);
  const sessionIds = await AuthSessionModel.find(
    { userId: { $in: userIds } },
    { _id: 1 },
    { session }
  )
    .lean()
    .then((records) => records.map((record) => record._id));
  if (sessionIds.length > 0) {
    await RefreshTokenHistoryModel.deleteMany({ sessionId: { $in: sessionIds } }, { session });
  }
  await AuthSessionModel.deleteMany({ userId: { $in: userIds } }, { session });
}

export async function seedDevelopmentDemoFixtures(input: {
  readonly passwordHashes: DevelopmentDemoPasswordHashes;
}): Promise<DevelopmentDemoSeedResult> {
  assertPasswordHashes(input.passwordHashes);
  await assertMigrationsApplied();

  await getInternalDatabaseConnection().transaction(async (session) => {
    await clearDemoSessions(session);

    await TenantModel.replaceOne(
      { _id: DEVELOPMENT_DEMO_IDS.tenant },
      {
        _id: DEVELOPMENT_DEMO_IDS.tenant,
        schemaVersion: 1,
        name: "ZuriDesk Demo Beauty Parlour",
        defaultLocationId: DEVELOPMENT_DEMO_IDS.location,
        status: "active",
        deletedAt: null,
        ownerGuardVersion: 0
      },
      { upsert: true, runValidators: true, session }
    );
    await LocationModel.replaceOne(
      { _id: DEVELOPMENT_DEMO_IDS.location },
      {
        _id: DEVELOPMENT_DEMO_IDS.location,
        schemaVersion: 1,
        tenantId: DEVELOPMENT_DEMO_IDS.tenant,
        name: "Westlands Demo Branch",
        timezone,
        status: "active",
        deletedAt: null
      },
      { upsert: true, runValidators: true, session }
    );

    for (const persona of DEVELOPMENT_DEMO_PERSONAS) {
      const userId = DEVELOPMENT_DEMO_IDS.users[persona.key];
      const membershipId = DEVELOPMENT_DEMO_IDS.memberships[persona.key];
      await UserModel.replaceOne(
        { _id: userId },
        {
          _id: userId,
          schemaVersion: 1,
          displayName: persona.displayName,
          normalizedEmail: persona.email,
          status: "active",
          deletedAt: null
        },
        { upsert: true, runValidators: true, session }
      );
      await AuthIdentityModel.replaceOne(
        { _id: DEVELOPMENT_DEMO_IDS.identities[persona.key] },
        {
          _id: DEVELOPMENT_DEMO_IDS.identities[persona.key],
          schemaVersion: 1,
          userId,
          normalizedEmail: persona.email,
          passwordHash: input.passwordHashes[persona.key],
          status: "active",
          verifiedAt: seededAt
        },
        { upsert: true, runValidators: true, session }
      );
      await MembershipModel.replaceOne(
        { _id: membershipId },
        {
          _id: membershipId,
          schemaVersion: 1,
          tenantId: DEVELOPMENT_DEMO_IDS.tenant,
          userId,
          roleKeys: [...persona.roleKeys],
          status: "active",
          joinedAt: seededAt,
          revokedAt: null,
          deletedAt: null
        },
        { upsert: true, runValidators: true, session }
      );
      await UserTenantDirectoryModel.replaceOne(
        { _id: DEVELOPMENT_DEMO_IDS.directories[persona.key] },
        {
          _id: DEVELOPMENT_DEMO_IDS.directories[persona.key],
          schemaVersion: 1,
          userId,
          entries: [
            {
              tenantId: DEVELOPMENT_DEMO_IDS.tenant,
              membershipId,
              roleKeys: [...persona.roleKeys],
              status: "active"
            }
          ]
        },
        { upsert: true, runValidators: true, session }
      );
    }

    await InviteModel.deleteMany(
      {
        tenantId: DEVELOPMENT_DEMO_IDS.tenant,
        "recipient.value": { $regex: /@demo\.zuridesk\.example$/ }
      },
      { session }
    );

    const services = [
      {
        id: DEVELOPMENT_DEMO_IDS.services.braids,
        name: "Knotless Braids",
        description: "Synthetic demo service for long-form braided styling."
      },
      {
        id: DEVELOPMENT_DEMO_IDS.services.manicure,
        name: "Gel Manicure",
        description: "Synthetic demo nail service."
      },
      {
        id: DEVELOPMENT_DEMO_IDS.services.washAndStyle,
        name: "Wash and Style",
        description: "Synthetic demo wash, treatment and styling service."
      }
    ] as const;
    for (const service of services) {
      await ServiceModel.replaceOne(
        { _id: service.id },
        {
          _id: service.id,
          schemaVersion: 1,
          tenantId: DEVELOPMENT_DEMO_IDS.tenant,
          name: service.name,
          description: service.description,
          status: "active",
          archivedAt: null
        },
        { upsert: true, runValidators: true, session }
      );
    }

    const staffProfiles = [
      {
        id: DEVELOPMENT_DEMO_IDS.staffProfiles.stylistA,
        membershipId: DEVELOPMENT_DEMO_IDS.memberships.stylistA,
        displayName: "Demo Stylist A",
        scheduleMode: "inherit_location" as const
      },
      {
        id: DEVELOPMENT_DEMO_IDS.staffProfiles.stylistB,
        membershipId: DEVELOPMENT_DEMO_IDS.memberships.stylistB,
        displayName: "Demo Stylist B",
        scheduleMode: "custom" as const
      }
    ];
    for (const profile of staffProfiles) {
      await StaffBookingProfileModel.replaceOne(
        { _id: profile.id },
        {
          _id: profile.id,
          schemaVersion: 1,
          tenantId: DEVELOPMENT_DEMO_IDS.tenant,
          membershipId: profile.membershipId,
          displayName: profile.displayName,
          scheduleMode: profile.scheduleMode,
          status: "active",
          archivedAt: null
        },
        { upsert: true, runValidators: true, session }
      );
    }

    for (const grant of [
      {
        id: DEVELOPMENT_DEMO_IDS.grants.manager,
        membershipId: DEVELOPMENT_DEMO_IDS.memberships.manager
      },
      {
        id: DEVELOPMENT_DEMO_IDS.grants.receptionist,
        membershipId: DEVELOPMENT_DEMO_IDS.memberships.receptionist
      }
    ]) {
      await LocationAccessGrantModel.replaceOne(
        { _id: grant.id },
        {
          _id: grant.id,
          schemaVersion: 1,
          tenantId: DEVELOPMENT_DEMO_IDS.tenant,
          targetMembershipId: grant.membershipId,
          locationId: DEVELOPMENT_DEMO_IDS.location,
          grantedByUserId: DEVELOPMENT_DEMO_IDS.users.owner,
          status: "active",
          revokedAt: null
        },
        { upsert: true, runValidators: true, session }
      );
    }

    for (const assignment of [
      {
        id: DEVELOPMENT_DEMO_IDS.assignments.stylistA,
        staffProfileId: DEVELOPMENT_DEMO_IDS.staffProfiles.stylistA
      },
      {
        id: DEVELOPMENT_DEMO_IDS.assignments.stylistB,
        staffProfileId: DEVELOPMENT_DEMO_IDS.staffProfiles.stylistB
      }
    ]) {
      await StaffLocationAssignmentModel.replaceOne(
        { _id: assignment.id },
        {
          _id: assignment.id,
          schemaVersion: 1,
          tenantId: DEVELOPMENT_DEMO_IDS.tenant,
          staffProfileId: assignment.staffProfileId,
          locationId: DEVELOPMENT_DEMO_IDS.location,
          status: "active",
          archivedAt: null
        },
        { upsert: true, runValidators: true, session }
      );
    }

    const eligibilities = [
      {
        id: DEVELOPMENT_DEMO_IDS.eligibilities.stylistABraids,
        staffProfileId: DEVELOPMENT_DEMO_IDS.staffProfiles.stylistA,
        serviceId: DEVELOPMENT_DEMO_IDS.services.braids
      },
      {
        id: DEVELOPMENT_DEMO_IDS.eligibilities.stylistAManicure,
        staffProfileId: DEVELOPMENT_DEMO_IDS.staffProfiles.stylistA,
        serviceId: DEVELOPMENT_DEMO_IDS.services.manicure
      },
      {
        id: DEVELOPMENT_DEMO_IDS.eligibilities.stylistAWashAndStyle,
        staffProfileId: DEVELOPMENT_DEMO_IDS.staffProfiles.stylistA,
        serviceId: DEVELOPMENT_DEMO_IDS.services.washAndStyle
      },
      {
        id: DEVELOPMENT_DEMO_IDS.eligibilities.stylistBBraids,
        staffProfileId: DEVELOPMENT_DEMO_IDS.staffProfiles.stylistB,
        serviceId: DEVELOPMENT_DEMO_IDS.services.braids
      },
      {
        id: DEVELOPMENT_DEMO_IDS.eligibilities.stylistBWashAndStyle,
        staffProfileId: DEVELOPMENT_DEMO_IDS.staffProfiles.stylistB,
        serviceId: DEVELOPMENT_DEMO_IDS.services.washAndStyle
      }
    ];
    for (const eligibility of eligibilities) {
      await StaffServiceEligibilityModel.replaceOne(
        { _id: eligibility.id },
        {
          _id: eligibility.id,
          schemaVersion: 1,
          tenantId: DEVELOPMENT_DEMO_IDS.tenant,
          staffProfileId: eligibility.staffProfileId,
          serviceId: eligibility.serviceId,
          status: "active",
          archivedAt: null
        },
        { upsert: true, runValidators: true, session }
      );
    }

    const offerings = [
      {
        id: DEVELOPMENT_DEMO_IDS.offerings.braids,
        serviceId: DEVELOPMENT_DEMO_IDS.services.braids,
        durationMinutes: 180,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15,
        quotedPriceMinor: 450_000,
        slotIncrementMinutes: 30,
        minAdvanceMinutes: 60,
        maxAdvanceDays: 90
      },
      {
        id: DEVELOPMENT_DEMO_IDS.offerings.manicure,
        serviceId: DEVELOPMENT_DEMO_IDS.services.manicure,
        durationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 10,
        quotedPriceMinor: 200_000,
        slotIncrementMinutes: 15,
        minAdvanceMinutes: 30,
        maxAdvanceDays: 90
      },
      {
        id: DEVELOPMENT_DEMO_IDS.offerings.washAndStyle,
        serviceId: DEVELOPMENT_DEMO_IDS.services.washAndStyle,
        durationMinutes: 90,
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 10,
        quotedPriceMinor: 250_000,
        slotIncrementMinutes: 30,
        minAdvanceMinutes: 30,
        maxAdvanceDays: 90
      }
    ];
    for (const offering of offerings) {
      await ServiceLocationOfferingModel.replaceOne(
        { _id: offering.id },
        {
          _id: offering.id,
          schemaVersion: 1,
          tenantId: DEVELOPMENT_DEMO_IDS.tenant,
          serviceId: offering.serviceId,
          locationId: DEVELOPMENT_DEMO_IDS.location,
          durationMinutes: offering.durationMinutes,
          bufferBeforeMinutes: offering.bufferBeforeMinutes,
          bufferAfterMinutes: offering.bufferAfterMinutes,
          quotedPriceMinor: offering.quotedPriceMinor,
          slotIncrementMinutes: offering.slotIncrementMinutes,
          minAdvanceMinutes: offering.minAdvanceMinutes,
          maxAdvanceDays: offering.maxAdvanceDays,
          status: "active",
          archivedAt: null
        },
        { upsert: true, runValidators: true, session }
      );
    }

    for (const schedule of [
      {
        id: DEVELOPMENT_DEMO_IDS.schedules.location,
        ownerType: "location" as const,
        ownerId: DEVELOPMENT_DEMO_IDS.location,
        week: locationWeek
      },
      {
        id: DEVELOPMENT_DEMO_IDS.schedules.stylistB,
        ownerType: "staff" as const,
        ownerId: DEVELOPMENT_DEMO_IDS.staffProfiles.stylistB,
        week: stylistBWeek
      }
    ]) {
      await WeeklyScheduleVersionModel.replaceOne(
        { _id: schedule.id },
        {
          _id: schedule.id,
          schemaVersion: 1,
          tenantId: DEVELOPMENT_DEMO_IDS.tenant,
          ownerType: schedule.ownerType,
          ownerId: schedule.ownerId,
          timezone,
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          week: schedule.week.map((day) => ({
            weekday: day.weekday,
            intervals: day.intervals.map((interval) => ({ ...interval }))
          })),
          createdByUserId: DEVELOPMENT_DEMO_IDS.users.owner,
          archivedAt: null
        },
        { upsert: true, runValidators: true, session }
      );
    }

    for (const guard of [
      {
        id: DEVELOPMENT_DEMO_IDS.guards.location,
        scopeType: "location" as const,
        scopeId: DEVELOPMENT_DEMO_IDS.location
      },
      {
        id: DEVELOPMENT_DEMO_IDS.guards.stylistA,
        scopeType: "staff" as const,
        scopeId: DEVELOPMENT_DEMO_IDS.staffProfiles.stylistA
      },
      {
        id: DEVELOPMENT_DEMO_IDS.guards.stylistB,
        scopeType: "staff" as const,
        scopeId: DEVELOPMENT_DEMO_IDS.staffProfiles.stylistB
      }
    ]) {
      await ScheduleGuardModel.updateOne(
        { _id: guard.id },
        {
          $setOnInsert: {
            _id: guard.id,
            schemaVersion: 1,
            tenantId: DEVELOPMENT_DEMO_IDS.tenant,
            scopeType: guard.scopeType,
            scopeId: guard.scopeId,
            version: 1
          }
        },
        { upsert: true, runValidators: true, setDefaultsOnInsert: true, session }
      );
    }
  });

  return {
    datasetVersion: DEVELOPMENT_DEMO_DATASET_VERSION,
    tenants: 1,
    locations: 1,
    users: DEVELOPMENT_DEMO_PERSONAS.length,
    memberships: DEVELOPMENT_DEMO_PERSONAS.length,
    services: 3,
    staffProfiles: 2,
    offerings: 3
  };
}
