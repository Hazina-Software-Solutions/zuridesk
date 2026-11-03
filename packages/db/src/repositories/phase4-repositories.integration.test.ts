import { randomUUID } from "node:crypto";

import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { connectDatabase, disconnectDatabase, getInternalDatabase } from "../connection";
import type { TrustedTenantContext } from "../context/tenant-context";
import { migrations } from "../migrations/registry";
import { runMigrations } from "../migrations/runner";
import {
  BookingEventModel,
  BookingModel,
  CalendarDateOverrideModel,
  MutationReceiptModel,
  ScheduleGuardModel,
  ServiceLocationOfferingModel,
  ServiceModel,
  StaffDayLockModel,
  WeeklyScheduleVersionModel
} from "../models/phase4-models";
import { membershipRepository, verifyCandidateTenantMembership } from "./membership-repository";
import {
  bookingConcurrencyRepository,
  bookingConfigurationRepository,
  bookingReadRepository,
  bookingScheduleRepository,
  serviceCatalogueRepository,
  staffBookingProfileRepository
} from "./phase4-repositories";
import { bootstrapTenantIdentity } from "./tenant-repository";
import { userRepository } from "./user-repository";

const uri = process.env.TEST_MONGODB_URI;
const databaseName = `zuridesk_test_phase41_repo_${randomUUID().replaceAll("-", "")}`;
const newId = () => new Types.ObjectId().toHexString();
const week = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  intervals: weekday === 0 ? [] : [{ startMinute: 540, endMinute: 1_020 }]
}));

describe.skipIf(uri === undefined)("Phase 4.1 tenant repositories", () => {
  let tenantAId: string;
  let tenantBId: string;
  let locationAId: string;
  let locationBId: string;
  let ownerId: string;
  let staffMembershipAId: string;
  let staffMembershipBId: string;
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
    locationAId = newId();
    locationBId = newId();
    ownerId = newId();
    await userRepository.create({ id: ownerId, displayName: "Owner" });
    await bootstrapTenantIdentity({
      tenantId: tenantAId,
      locationId: locationAId,
      membershipId: newId(),
      userId: ownerId,
      tenantName: "Tenant A",
      locationName: "A Nairobi",
      timezone: "Africa/Nairobi"
    });
    await bootstrapTenantIdentity({
      tenantId: tenantBId,
      locationId: locationBId,
      membershipId: newId(),
      userId: ownerId,
      tenantName: "Tenant B",
      locationName: "B Kampala",
      timezone: "Africa/Kampala"
    });
    contextA = (await verifyCandidateTenantMembership({
      tenantId: tenantAId,
      authenticatedUserId: ownerId,
      requestId: "phase41-a"
    }))!;
    contextB = (await verifyCandidateTenantMembership({
      tenantId: tenantBId,
      authenticatedUserId: ownerId,
      requestId: "phase41-b"
    }))!;
    const staffA = await userRepository.create({ id: newId(), displayName: "Stylist A" });
    const staffB = await userRepository.create({ id: newId(), displayName: "Stylist B" });
    staffMembershipAId = (
      await membershipRepository.create(contextA, { userId: staffA.id, roleKeys: ["stylist"] })
    ).id;
    staffMembershipBId = (
      await membershipRepository.create(contextB, { userId: staffB.id, roleKeys: ["stylist"] })
    ).id;
  });

  afterAll(async () => {
    await getInternalDatabase().dropDatabase();
    await disconnectDatabase();
  });

  async function createProfileA() {
    return staffBookingProfileRepository.create(contextA, {
      membershipId: staffMembershipAId,
      displayName: "Stylist A"
    });
  }

  async function persistBooking(
    tenantId: string,
    locationId: string,
    staffProfileId: string,
    status: "pending" | "confirmed" = "pending"
  ) {
    return BookingModel.create({
      schemaVersion: 1,
      tenantId: new Types.ObjectId(tenantId),
      locationId: new Types.ObjectId(locationId),
      localDate: "2026-11-04",
      timezone: tenantId === tenantAId ? "Africa/Nairobi" : "Africa/Kampala",
      startsAt: new Date("2026-11-04T06:00:00.000Z"),
      endsAt: new Date("2026-11-04T07:00:00.000Z"),
      status,
      version: 0,
      source: "appointment",
      guest: { kind: "named", displayName: "Derived snapshot", customerId: null },
      lines: [
        {
          order: 0,
          serviceId: new Types.ObjectId(),
          serviceName: "Derived service",
          assignedStaffProfileId: new Types.ObjectId(staffProfileId),
          durationMinutes: 60,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          quotedPriceMinor: 100000,
          startsAt: new Date("2026-11-04T06:00:00.000Z"),
          endsAt: new Date("2026-11-04T07:00:00.000Z"),
          status: "scheduled",
          skippedReasonCode: null
        }
      ],
      deletedAt: null
    });
  }

  it("scopes strict catalogue/configuration writes and never leaks Mongoose documents", async () => {
    const serviceA = await serviceCatalogueRepository.create(contextA, {
      name: "Braids",
      description: "Protective styling"
    });
    const serviceB = await serviceCatalogueRepository.create(contextB, { name: "Haircut" });
    const profileA = await createProfileA();
    expect(await serviceCatalogueRepository.countActive(contextA)).toBe(1);
    await expect(
      serviceCatalogueRepository.update(contextA, serviceB.id as string, { name: "Stolen" })
    ).resolves.toBeNull();
    await expect(
      bookingConfigurationRepository.assignLocation(contextA, {
        staffProfileId: newId(),
        locationId: locationAId
      })
    ).rejects.toThrow("current tenant");
    await bookingConfigurationRepository.grantLocationAccess(contextA, {
      targetMembershipId: staffMembershipAId,
      locationId: locationAId
    });
    await bookingConfigurationRepository.assignLocation(contextA, {
      staffProfileId: profileA.id as string,
      locationId: locationAId
    });
    await bookingConfigurationRepository.setServiceEligibility(contextA, {
      staffProfileId: profileA.id as string,
      serviceId: serviceA.id as string
    });
    await bookingConfigurationRepository.configureOffering(contextA, {
      serviceId: serviceA.id as string,
      locationId: locationAId,
      durationMinutes: 90,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 15,
      quotedPriceMinor: 250000,
      slotIncrementMinutes: 15,
      minAdvanceMinutes: 60,
      maxAdvanceDays: 90
    });
    await expect(
      bookingConfigurationRepository.configureOffering(contextA, {
        serviceId: serviceA.id as string,
        locationId: locationAId,
        durationMinutes: 90.5,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 15,
        quotedPriceMinor: 250000,
        slotIncrementMinutes: 7,
        minAdvanceMinutes: 60,
        maxAdvanceDays: 90
      })
    ).rejects.toThrow();
    const listed = await serviceCatalogueRepository.listActive(contextA);
    expect(Object.getPrototypeOf(listed[0])).toBe(Object.prototype);
    expect("save" in listed[0]!).toBe(false);
  });

  it("atomically closes the open weekly schedule and admits one concurrent successor", async () => {
    await expect(
      bookingScheduleRepository.createWeeklyScheduleSuccessor(contextA, {
        ownerType: "location",
        ownerId: locationBId,
        timezone: "Africa/Kampala",
        effectiveFrom: "2026-11-01",
        week
      })
    ).rejects.toThrow("current tenant");
    await bookingScheduleRepository.createWeeklyScheduleSuccessor(contextA, {
      ownerType: "location",
      ownerId: locationAId,
      timezone: "Africa/Nairobi",
      effectiveFrom: "2026-11-01",
      week
    });
    await bookingScheduleRepository.createWeeklyScheduleSuccessor(contextA, {
      ownerType: "location",
      ownerId: locationAId,
      timezone: "Africa/Nairobi",
      effectiveFrom: "2026-12-01",
      week
    });
    const firstHistory = await WeeklyScheduleVersionModel.find({
      tenantId: new Types.ObjectId(tenantAId),
      ownerType: "location",
      ownerId: new Types.ObjectId(locationAId)
    }).sort({ effectiveFrom: 1 });
    expect(
      firstHistory.map(({ effectiveFrom, effectiveTo }) => [effectiveFrom, effectiveTo])
    ).toEqual([
      ["2026-11-01", "2026-11-30"],
      ["2026-12-01", null]
    ]);

    const outcomes = await Promise.allSettled([
      bookingScheduleRepository.createWeeklyScheduleSuccessor(contextA, {
        ownerType: "location",
        ownerId: locationAId,
        timezone: "Africa/Nairobi",
        effectiveFrom: "2027-01-01",
        week
      }),
      bookingScheduleRepository.createWeeklyScheduleSuccessor(contextA, {
        ownerType: "location",
        ownerId: locationAId,
        timezone: "Africa/Nairobi",
        effectiveFrom: "2027-01-01",
        week
      })
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(
      String((outcomes.find(({ status }) => status === "rejected") as PromiseRejectedResult).reason)
    ).toContain("Schedule successor conflict");
    expect(
      await WeeklyScheduleVersionModel.countDocuments({
        tenantId: new Types.ObjectId(tenantAId),
        ownerId: new Types.ObjectId(locationAId),
        effectiveTo: null
      })
    ).toBe(1);
    expect(
      await WeeklyScheduleVersionModel.countDocuments({
        tenantId: new Types.ObjectId(tenantAId),
        ownerId: new Types.ObjectId(locationAId)
      })
    ).toBe(3);
    expect(
      await ScheduleGuardModel.findOne({
        tenantId: new Types.ObjectId(tenantAId),
        scopeId: new Types.ObjectId(locationAId)
      })
    ).toMatchObject({ version: 3 });
  });

  it("replaces immutable date overrides without stale resurrection and admits one race winner", async () => {
    const base = {
      ownerType: "location" as const,
      ownerId: locationAId,
      timezone: "Africa/Nairobi",
      localDate: "2026-12-25"
    };
    const created = await bookingScheduleRepository.setDateOverride(contextA, {
      ...base,
      intervals: []
    });
    const edited = await bookingScheduleRepository.setDateOverride(contextA, {
      ...base,
      intervals: [{ startMinute: 600, endMinute: 660 }]
    });
    expect(edited.id).not.toBe(created.id);
    const archivedCreated = await CalendarDateOverrideModel.findById(created.id).select({
      archivedAt: 1
    });
    expect(archivedCreated?.archivedAt).toBeInstanceOf(Date);
    expect(
      await CalendarDateOverrideModel.countDocuments({
        tenantId: new Types.ObjectId(tenantAId),
        ownerId: new Types.ObjectId(locationAId),
        localDate: base.localDate,
        archivedAt: null
      })
    ).toBe(1);
    await expect(
      bookingScheduleRepository.setDateOverride(contextA, {
        ...base,
        timezone: "Africa/Kampala",
        intervals: []
      })
    ).rejects.toThrow("must match the location timezone");

    await bookingScheduleRepository.archiveDateOverride(contextA, {
      ownerType: base.ownerType,
      ownerId: base.ownerId,
      localDate: base.localDate
    });
    const afterArchive = await bookingScheduleRepository.setDateOverride(contextA, {
      ...base,
      intervals: [{ startMinute: 720, endMinute: 780 }]
    });
    expect(afterArchive.id).not.toBe(edited.id);
    expect(
      await CalendarDateOverrideModel.countDocuments({
        tenantId: new Types.ObjectId(tenantAId),
        ownerId: new Types.ObjectId(locationAId),
        localDate: base.localDate,
        archivedAt: null
      })
    ).toBe(1);

    const race = await Promise.allSettled([
      bookingScheduleRepository.setDateOverride(contextA, {
        ...base,
        intervals: [{ startMinute: 840, endMinute: 900 }]
      }),
      bookingScheduleRepository.setDateOverride(contextA, {
        ...base,
        intervals: [{ startMinute: 900, endMinute: 960 }]
      })
    ]);
    expect(race.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(race.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(
      await CalendarDateOverrideModel.countDocuments({
        tenantId: new Types.ObjectId(tenantAId),
        ownerId: new Types.ObjectId(locationAId),
        localDate: base.localDate,
        archivedAt: null
      })
    ).toBe(1);
    const archived = await CalendarDateOverrideModel.find({
      tenantId: new Types.ObjectId(tenantAId),
      ownerId: new Types.ObjectId(locationAId),
      localDate: base.localDate,
      archivedAt: { $ne: null }
    });
    expect(archived).toHaveLength(3);
    expect(archived.every(({ archivedAt }) => archivedAt instanceof Date)).toBe(true);
  });

  it("validates staff override timezone at its historical date and detects successor races", async () => {
    const profileA = await createProfileA();
    await staffBookingProfileRepository.setScheduleMode(contextA, profileA.id as string, "custom");
    await bookingScheduleRepository.createWeeklyScheduleSuccessor(contextA, {
      ownerType: "staff",
      ownerId: profileA.id as string,
      timezone: "Africa/Nairobi",
      effectiveFrom: "2026-01-01",
      week
    });
    await bookingScheduleRepository.createWeeklyScheduleSuccessor(contextA, {
      ownerType: "staff",
      ownerId: profileA.id as string,
      timezone: "Africa/Kampala",
      effectiveFrom: "2027-01-01",
      week
    });
    await expect(
      bookingScheduleRepository.setDateOverride(contextA, {
        ownerType: "staff",
        ownerId: profileA.id as string,
        timezone: "Africa/Nairobi",
        localDate: "2026-06-01",
        intervals: []
      })
    ).resolves.toMatchObject({ timezone: "Africa/Nairobi" });
    await expect(
      bookingScheduleRepository.setDateOverride(contextA, {
        ownerType: "staff",
        ownerId: profileA.id as string,
        timezone: "Africa/Kampala",
        localDate: "2026-06-02",
        intervals: []
      })
    ).rejects.toThrow("effective schedule version");
    await expect(
      bookingScheduleRepository.setDateOverride(contextA, {
        ownerType: "staff",
        ownerId: profileA.id as string,
        timezone: "Africa/Nairobi",
        localDate: "2027-06-01",
        intervals: []
      })
    ).rejects.toThrow("effective schedule version");
    await expect(
      bookingScheduleRepository.setDateOverride(contextA, {
        ownerType: "staff",
        ownerId: profileA.id as string,
        timezone: "Africa/Kampala",
        localDate: "2027-06-01",
        intervals: []
      })
    ).resolves.toMatchObject({ timezone: "Africa/Kampala" });

    const race = await Promise.allSettled([
      bookingScheduleRepository.createWeeklyScheduleSuccessor(contextA, {
        ownerType: "staff",
        ownerId: profileA.id as string,
        timezone: "Africa/Nairobi",
        effectiveFrom: "2028-01-01",
        week
      }),
      bookingScheduleRepository.setDateOverride(contextA, {
        ownerType: "staff",
        ownerId: profileA.id as string,
        timezone: "Africa/Kampala",
        localDate: "2028-06-01",
        intervals: []
      })
    ]);
    expect(race.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(race.filter(({ status }) => status === "rejected")).toHaveLength(1);
  });

  it("guards archive races and increments the schedule guard exactly once", async () => {
    const identity = {
      ownerType: "location" as const,
      ownerId: locationAId,
      localDate: "2026-12-31"
    };
    await bookingScheduleRepository.setDateOverride(contextA, {
      ...identity,
      timezone: "Africa/Nairobi",
      intervals: []
    });
    const guardBefore = await ScheduleGuardModel.findOne({
      tenantId: new Types.ObjectId(tenantAId),
      scopeType: "location",
      scopeId: new Types.ObjectId(locationAId)
    });
    const race = await Promise.allSettled([
      bookingScheduleRepository.archiveDateOverride(contextA, identity),
      bookingScheduleRepository.archiveDateOverride(contextA, identity)
    ]);
    expect(race.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(race.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const guardAfter = await ScheduleGuardModel.findById(guardBefore?._id);
    expect(guardAfter?.version).toBe((guardBefore?.version ?? 0) + 1);
    expect(
      await CalendarDateOverrideModel.countDocuments({
        tenantId: new Types.ObjectId(tenantAId),
        ownerId: new Types.ObjectId(locationAId),
        localDate: identity.localDate,
        archivedAt: null
      })
    ).toBe(0);
  });

  it("exposes booking reads/counts only, enforces tenant isolation, and wins the status index", async () => {
    const profileA = await createProfileA();
    const profileB = await staffBookingProfileRepository.create(contextB, {
      membershipId: staffMembershipBId,
      displayName: "Stylist B"
    });
    const bookingA = await persistBooking(tenantAId, locationAId, profileA.id as string, "pending");
    const bookingB = await persistBooking(tenantBId, locationBId, profileB.id as string, "pending");
    await expect(
      bookingReadRepository.findById(contextA, bookingB._id.toHexString())
    ).resolves.toBeNull();
    expect(await bookingReadRepository.countByStatus(contextA, "pending")).toBe(1);
    expect(await bookingReadRepository.listByStatus(contextA, "pending")).toEqual([
      expect.objectContaining({ id: bookingA._id.toHexString(), tenantId: tenantAId })
    ]);
    expect(await bookingReadRepository.aggregateDailyCounts(contextA, locationAId)).toEqual([
      { id: "2026-11-04", count: 1 }
    ]);
    expect("createPending" in bookingReadRepository).toBe(false);

    const plan = await BookingModel.find({
      tenantId: new Types.ObjectId(tenantAId),
      status: "pending",
      deletedAt: null
    })
      .sort({ startsAt: 1, _id: 1 })
      .explain("executionStats");
    expect(
      JSON.stringify(
        (plan as unknown as { queryPlanner: { winningPlan: unknown } }).queryPlanner.winningPlan
      )
    ).toContain("tenant_booking_status_live");
  });

  it("blocks every generic booking mutation path until authoritative commands exist", async () => {
    const profileA = await createProfileA();
    const persisted = await persistBooking(
      tenantAId,
      locationAId,
      profileA.id as string,
      "confirmed"
    );
    const filter = { _id: persisted._id };
    await expect(BookingModel.updateOne(filter, { $set: { status: "completed" } })).rejects.toThrow(
      "Generic booking updates are forbidden"
    );
    await expect(
      BookingModel.updateMany(filter, {
        $set: { "lines.0.status": "skipped", "lines.0.skippedReasonCode": null }
      })
    ).rejects.toThrow("Generic booking updates are forbidden");
    await expect(
      BookingModel.findOneAndUpdate(filter, {
        $set: { "lines.0.durationMinutes": 1, "lines.0.bufferAfterMinutes": 240 }
      })
    ).rejects.toThrow("Generic booking updates are forbidden");
    await expect(
      BookingModel.updateOne(filter, {
        $set: {
          lines: [
            {
              ...persisted.lines[0],
              serviceName: "Tampered whole-line commercial snapshot"
            }
          ]
        }
      })
    ).rejects.toThrow("Generic booking updates are forbidden");
    await expect(BookingModel.replaceOne(filter, persisted.toObject())).rejects.toThrow(
      "replacement is forbidden"
    );
    await expect(BookingModel.deleteOne(filter)).rejects.toThrow("hard deletion is forbidden");
    await expect(
      BookingModel.bulkWrite([{ updateOne: { filter, update: { $set: { status: "completed" } } } }])
    ).rejects.toThrow("bulk mutation is forbidden");
    persisted.status = "completed";
    await expect(persisted.save({ validateBeforeSave: false })).rejects.toThrow(
      "Existing booking document saves are forbidden"
    );
    await expect(
      BookingModel.bulkSave([persisted], { middleware: false, validateBeforeSave: false })
    ).rejects.toThrow("Booking bulkSave is forbidden");
  });

  it("uses canonical UTC-day locks across timezone representations and midnight", async () => {
    const profileA = await createProfileA();
    const input = {
      staffProfileId: profileA.id as string,
      bufferedStartsAt: new Date("2026-11-04T23:30:00.000Z"),
      bufferedEndsAt: new Date("2026-11-05T00:30:00.000Z")
    };
    const first = await bookingConcurrencyRepository.acquireStaffUtcDayLocks(contextA, input);
    expect(first.map(({ utcDate }) => utcDate)).toEqual(["2026-11-04", "2026-11-05"]);
    const sameInstantsFromOtherZones = await bookingConcurrencyRepository.acquireStaffUtcDayLocks(
      contextA,
      {
        staffProfileId: profileA.id as string,
        bufferedStartsAt: new Date("2026-11-04T18:30:00-05:00"),
        bufferedEndsAt: new Date("2026-11-05T03:30:00+03:00")
      }
    );
    expect(sameInstantsFromOtherZones.map(({ id }) => id)).toEqual(first.map(({ id }) => id));
    expect(sameInstantsFromOtherZones.map(({ version }) => version)).toEqual([2, 2]);
    expect(
      await StaffDayLockModel.countDocuments({ tenantId: new Types.ObjectId(tenantAId) })
    ).toBe(2);
  });

  it("atomically claims, replays, conflicts and completes mutation receipts", async () => {
    const claim = {
      operation: "booking.create",
      idempotencyKey: "offline-client-key-0001",
      requestHash: "a".repeat(64),
      expectedVersion: 0
    };
    const first = await bookingConcurrencyRepository.claimMutation(contextA, claim);
    expect(first).toMatchObject({ replay: false, receipt: { status: "processing" } });
    await expect(
      bookingConcurrencyRepository.claimMutation(contextA, claim)
    ).resolves.toMatchObject({
      replay: true,
      receipt: { id: first.receipt.id }
    });
    await expect(
      bookingConcurrencyRepository.claimMutation(contextA, {
        ...claim,
        requestHash: "b".repeat(64)
      })
    ).rejects.toThrow("Idempotency conflict");

    const concurrentKey = { ...claim, idempotencyKey: "offline-client-key-0002" };
    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () =>
        bookingConcurrencyRepository.claimMutation(contextA, concurrentKey)
      )
    );
    expect(concurrent.filter(({ replay }) => !replay)).toHaveLength(1);
    expect(new Set(concurrent.map(({ receipt }) => receipt.id)).size).toBe(1);

    const entityId = newId();
    const completion = {
      receiptId: first.receipt.id as string,
      status: "succeeded" as const,
      entityType: "booking",
      entityId
    };
    await expect(
      bookingConcurrencyRepository.completeMutation(contextA, completion)
    ).resolves.toMatchObject({ replay: false, receipt: { status: "succeeded" } });
    await expect(
      bookingConcurrencyRepository.completeMutation(contextA, completion)
    ).resolves.toMatchObject({ replay: true });
    await expect(
      bookingConcurrencyRepository.completeMutation(contextA, {
        ...completion,
        status: "failed"
      })
    ).rejects.toThrow("completion conflict");
    const stored = await MutationReceiptModel.findById(first.receipt.id);
    expect(stored?.completedAt).toBeInstanceOf(Date);
  });

  it("blocks every booking-event mutation and deletion path at the model boundary", async () => {
    const event = await BookingEventModel.create({
      schemaVersion: 1,
      tenantId: new Types.ObjectId(tenantAId),
      bookingId: new Types.ObjectId(),
      sequence: 0,
      eventType: "created",
      actorUserId: new Types.ObjectId(ownerId),
      occurredAt: new Date(),
      reasonCode: null,
      note: null,
      fromStatus: null,
      toStatus: "pending",
      lineOrder: null,
      bookingVersion: 0
    });
    const filter = { _id: event._id };
    const replacement = event.toObject();
    const attempts = [
      BookingEventModel.updateOne(filter, { $set: { note: "changed" } }),
      BookingEventModel.updateMany(filter, { $set: { note: "changed" } }),
      BookingEventModel.findOneAndUpdate(filter, { $set: { note: "changed" } }),
      BookingEventModel.replaceOne(filter, replacement),
      BookingEventModel.findOneAndReplace(filter, replacement),
      BookingEventModel.deleteOne(filter),
      BookingEventModel.deleteMany(filter),
      BookingEventModel.findOneAndDelete(filter),
      BookingEventModel.bulkWrite([{ deleteOne: { filter } }])
    ];
    for (const attempt of attempts) await expect(attempt).rejects.toThrow("immutable");
    await expect(event.deleteOne()).rejects.toThrow("immutable");
    expect(await BookingEventModel.countDocuments(filter)).toBe(1);
  });

  it("uses tenant-prefixed indexes for catalogue, offering and schedule queries", async () => {
    const tenantId = new Types.ObjectId(tenantAId);
    const winning = (explain: unknown) =>
      JSON.stringify(
        (explain as { queryPlanner?: { winningPlan?: unknown } }).queryPlanner?.winningPlan
      );
    const servicePlan = await ServiceModel.find({ tenantId, status: "active" })
      .sort({ name: 1, _id: 1 })
      .explain("executionStats");
    const offeringPlan = await ServiceLocationOfferingModel.find({
      tenantId,
      locationId: new Types.ObjectId(locationAId),
      status: "active"
    })
      .sort({ serviceId: 1 })
      .explain("executionStats");
    const schedulePlan = await WeeklyScheduleVersionModel.find({
      tenantId,
      ownerType: "location",
      ownerId: new Types.ObjectId(locationAId),
      archivedAt: null,
      effectiveFrom: { $lte: "2026-11-04" },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: "2026-11-04" } }]
    })
      .sort({ effectiveFrom: -1 })
      .explain("executionStats");
    expect(winning(servicePlan)).toContain("tenant_status_name");
    expect(winning(offeringPlan)).toContain("tenant_location_active_offerings");
    expect(winning(schedulePlan)).toMatch(/tenant_schedule_effective_(?:unique|lookup)/);
  });
});
