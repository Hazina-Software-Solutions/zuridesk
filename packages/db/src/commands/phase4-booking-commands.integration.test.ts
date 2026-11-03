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
  MutationReceiptModel,
  StaffDayLockModel
} from "../models/phase4-models";
import {
  membershipRepository,
  verifyCandidateTenantMembership
} from "../repositories/membership-repository";
import { locationRepository } from "../repositories/location-repository";
import {
  bookingConfigurationRepository,
  bookingScheduleRepository,
  serviceCatalogueRepository,
  staffBookingProfileRepository
} from "../repositories/phase4-repositories";
import { bootstrapTenantIdentity } from "../repositories/tenant-repository";
import { userRepository } from "../repositories/user-repository";
import { DatabaseCommandError } from "./errors";
import {
  confirmBooking,
  createBooking,
  queryBookingAvailability,
  rescheduleBooking
} from "./phase4-booking-commands";

const uri = process.env.TEST_MONGODB_URI;
const databaseName = `zuridesk_test_phase42_${randomUUID().replaceAll("-", "")}`;
const newId = () => new Types.ObjectId().toHexString();
const clock = () => new Date("2026-11-03T06:00:00.000Z");
const week = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  intervals: [{ startMinute: 540, endMinute: 1_020 }]
}));

describe.skipIf(uri === undefined)("Phase 4.2 availability and booking commands", () => {
  let context: TrustedTenantContext;
  let otherContext: TrustedTenantContext;
  let tenantId: string;
  let otherTenantId: string;
  let locationId: string;
  let otherLocationId: string;
  let staffProfileId: string;
  let serviceId: string;

  beforeAll(async () => {
    await connectDatabase({ uri: uri!, databaseName });
  });

  beforeEach(async () => {
    await getInternalDatabase().dropDatabase();
    await runMigrations(getInternalDatabase(), migrations);
    tenantId = newId();
    otherTenantId = newId();
    locationId = newId();
    otherLocationId = newId();
    const ownerId = newId();
    const otherOwnerId = newId();
    await userRepository.create({ id: ownerId, displayName: "Owner" });
    await userRepository.create({ id: otherOwnerId, displayName: "Other owner" });
    await bootstrapTenantIdentity({
      tenantId,
      locationId,
      membershipId: newId(),
      userId: ownerId,
      tenantName: "Tenant A",
      locationName: "Nairobi salon",
      timezone: "Africa/Nairobi"
    });
    await bootstrapTenantIdentity({
      tenantId: otherTenantId,
      locationId: otherLocationId,
      membershipId: newId(),
      userId: otherOwnerId,
      tenantName: "Tenant B",
      locationName: "Other salon",
      timezone: "Africa/Nairobi"
    });
    context = (await verifyCandidateTenantMembership({
      tenantId,
      authenticatedUserId: ownerId,
      requestId: "phase42-owner"
    }))!;
    otherContext = (await verifyCandidateTenantMembership({
      tenantId: otherTenantId,
      authenticatedUserId: otherOwnerId,
      requestId: "phase42-other"
    }))!;
    const stylist = await userRepository.create({ id: newId(), displayName: "Stylist" });
    const membership = await membershipRepository.create(context, {
      userId: stylist.id,
      roleKeys: ["stylist"]
    });
    const profile = await staffBookingProfileRepository.create(context, {
      membershipId: membership.id,
      displayName: "Stylist"
    });
    staffProfileId = profile.id as string;
    const service = await serviceCatalogueRepository.create(context, { name: "Braids" });
    serviceId = service.id as string;
    await staffBookingProfileRepository.setScheduleMode(
      context,
      staffProfileId,
      "inherit_location"
    );
    await bookingConfigurationRepository.assignLocation(context, { staffProfileId, locationId });
    await bookingConfigurationRepository.setServiceEligibility(context, {
      staffProfileId,
      serviceId
    });
    await bookingConfigurationRepository.configureOffering(context, {
      serviceId,
      locationId,
      durationMinutes: 60,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
      quotedPriceMinor: 250000,
      slotIncrementMinutes: 15,
      minAdvanceMinutes: 0,
      maxAdvanceDays: 30
    });
    await bookingScheduleRepository.createWeeklyScheduleSuccessor(context, {
      ownerType: "location",
      ownerId: locationId,
      timezone: "Africa/Nairobi",
      effectiveFrom: "2026-11-01",
      week
    });
  });

  afterAll(async () => {
    await getInternalDatabase().dropDatabase();
    await disconnectDatabase();
  });

  const selection = () => [{ serviceId, assignedStaffProfileId: staffProfileId }];
  const guest = { kind: "named" as const, displayName: "A guest", customerId: null };

  it("computes deterministic slots, override replacement and unavailability subtraction", async () => {
    const open = await queryBookingAvailability(
      context,
      { locationId, localDate: "2026-11-10", selections: selection(), limit: 10 },
      { clock }
    );
    expect(open.timezone).toBe("Africa/Nairobi");
    expect(open.slots[0]!.lines[0]!.startsAt.toISOString()).toBe("2026-11-10T06:15:00.000Z");
    expect(open.guardVersions).toHaveLength(2);

    await bookingScheduleRepository.setDateOverride(context, {
      ownerType: "location",
      ownerId: locationId,
      timezone: "Africa/Nairobi",
      localDate: "2026-11-10",
      intervals: [
        { startMinute: 600, endMinute: 720 },
        { startMinute: 780, endMinute: 900 }
      ]
    });
    await bookingScheduleRepository.createUnavailability(context, {
      staffProfileId,
      startsAt: new Date("2026-11-10T07:00:00.000Z"),
      endsAt: new Date("2026-11-10T08:00:00.000Z"),
      reasonCode: "approved_leave"
    });
    const constrained = await queryBookingAvailability(
      context,
      { locationId, localDate: "2026-11-10", selections: selection() },
      { clock }
    );
    expect(
      constrained.slots.every(
        (slot) =>
          slot.lines[0]!.bufferedEndsAt <= new Date("2026-11-10T07:00:00.000Z") ||
          slot.lines[0]!.bufferedStartsAt >= new Date("2026-11-10T08:00:00.000Z")
      )
    ).toBe(true);
  });

  it("authorizes availability by role and active location grant", async () => {
    const managerUser = await userRepository.create({ id: newId(), displayName: "Manager" });
    const managerMembership = await membershipRepository.create(context, {
      userId: managerUser.id,
      roleKeys: ["manager"]
    });
    const managerContext = (await verifyCandidateTenantMembership({
      tenantId,
      authenticatedUserId: managerUser.id,
      requestId: "phase42-manager"
    }))!;
    const stylistUser = await userRepository.create({ id: newId(), displayName: "Denied stylist" });
    await membershipRepository.create(context, {
      userId: stylistUser.id,
      roleKeys: ["stylist"]
    });
    const stylistContext = (await verifyCandidateTenantMembership({
      tenantId,
      authenticatedUserId: stylistUser.id,
      requestId: "phase42-stylist"
    }))!;
    const input = {
      locationId,
      localDate: "2026-11-10",
      selections: selection(),
      limit: 1
    };

    await expect(queryBookingAvailability(context, input, { clock })).resolves.toMatchObject({
      locationId
    });
    await expect(queryBookingAvailability(managerContext, input, { clock })).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    await expect(queryBookingAvailability(stylistContext, input, { clock })).rejects.toMatchObject({
      code: "FORBIDDEN"
    });

    await bookingConfigurationRepository.grantLocationAccess(context, {
      targetMembershipId: managerMembership.id,
      locationId
    });
    await expect(queryBookingAvailability(managerContext, input, { clock })).resolves.toMatchObject(
      {
        locationId
      }
    );
  });

  it("rejects off-grid appointments and rounds later non-zero-second walk-in lines forward", async () => {
    await expect(
      createBooking(
        context,
        {
          idempotencyKey: "off-grid-create-01",
          locationId,
          source: "appointment",
          guest,
          selections: selection(),
          startsAt: new Date("2026-11-10T06:16:00.000Z")
        },
        { clock }
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const created = await createBooking(
      context,
      {
        idempotencyKey: "grid-reschedule-1",
        locationId,
        source: "appointment",
        guest,
        selections: selection(),
        startsAt: new Date("2026-11-10T06:15:00.000Z")
      },
      { clock }
    );
    await expect(
      rescheduleBooking(
        context,
        {
          bookingId: created.booking.id,
          expectedVersion: 0,
          idempotencyKey: "off-grid-resched1",
          reasonCode: "guest_request",
          startsAt: new Date("2026-11-10T08:16:00.000Z"),
          selections: selection()
        },
        { clock }
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const walkIn = await createBooking(
      context,
      {
        idempotencyKey: "second-walk-in-01",
        locationId,
        source: "walk_in",
        guest: { kind: "anonymous", displayName: "Walk-in guest", customerId: null },
        selections: [...selection(), ...selection()]
      },
      { clock: () => new Date("2026-11-11T06:15:30.000Z") }
    );
    expect(walkIn.booking.lines.map(({ startsAt }) => startsAt.toISOString())).toEqual([
      "2026-11-11T06:15:30.000Z",
      "2026-11-11T08:00:00.000Z"
    ]);
  });

  it("replays concurrent same-key creation and rejects a different hash for that key", async () => {
    const input = {
      idempotencyKey: "same-key-concurrent",
      locationId,
      source: "appointment" as const,
      guest,
      selections: selection(),
      startsAt: new Date("2026-11-11T06:15:00.000Z")
    };
    const results = await Promise.all([
      createBooking(context, input, { clock }),
      createBooking(context, input, { clock })
    ]);
    expect(results.map(({ replay }) => replay).sort()).toEqual([false, true]);
    expect(new Set(results.map(({ booking }) => booking.id)).size).toBe(1);
    await expect(
      createBooking(context, { ...input, guest: { ...guest, displayName: "Different" } }, { clock })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("derives snapshots, keeps pending nonblocking and makes concurrent confirmation single-winner", async () => {
    const startsAt = new Date("2026-11-10T06:15:00.000Z");
    const pending = await createBooking(
      context,
      {
        idempotencyKey: "pending-booking-0001",
        locationId,
        source: "appointment",
        status: "pending",
        guest,
        selections: selection(),
        startsAt
      },
      { clock }
    );
    expect(pending.booking.lines[0]).toMatchObject({
      serviceName: "Braids",
      durationMinutes: 60,
      quotedPriceMinor: 250000
    });
    const confirmed = await createBooking(
      context,
      {
        idempotencyKey: "confirmed-booking-1",
        locationId,
        source: "appointment",
        status: "confirmed",
        guest,
        selections: selection(),
        startsAt
      },
      { clock }
    );
    expect(confirmed.booking.status).toBe("confirmed");
    await expect(
      confirmBooking(
        context,
        {
          bookingId: pending.booking.id,
          expectedVersion: 0,
          idempotencyKey: "pending-confirm-0001"
        },
        { clock }
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const secondPending = await createBooking(
      context,
      {
        idempotencyKey: "pending-booking-0002",
        locationId,
        source: "appointment",
        status: "pending",
        guest,
        selections: selection(),
        startsAt: new Date("2026-11-10T08:15:00.000Z")
      },
      { clock }
    );
    const confirmations = await Promise.allSettled(
      ["concurrent-confirm-a", "concurrent-confirm-b"].map((idempotencyKey) =>
        confirmBooking(
          context,
          { bookingId: secondPending.booking.id, expectedVersion: 0, idempotencyKey },
          { clock }
        )
      )
    );
    expect(confirmations.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(confirmations.filter(({ status }) => status === "rejected")).toHaveLength(1);
  });

  it("confirms only the pending booking's exact stored multi-line occupancy", async () => {
    const pending = await createBooking(
      context,
      {
        idempotencyKey: "exact-pending-lines",
        locationId,
        source: "appointment",
        status: "pending",
        guest,
        selections: [...selection(), ...selection()],
        startsAt: new Date("2026-11-10T06:15:00.000Z")
      },
      { clock }
    );
    await createBooking(
      context,
      {
        idempotencyKey: "occupy-second-line",
        locationId,
        source: "appointment",
        status: "confirmed",
        guest,
        selections: selection(),
        startsAt: new Date("2026-11-10T07:45:00.000Z")
      },
      { clock }
    );
    await expect(
      confirmBooking(
        context,
        {
          bookingId: pending.booking.id,
          expectedVersion: 0,
          idempotencyKey: "confirm-exact-lines"
        },
        { clock }
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await BookingModel.findById(pending.booking.id).select({ status: 1, version: 1 }).lean()
    ).toMatchObject({ status: "pending", version: 0 });
  });

  it("admits exactly one of eight concurrent confirmed bookings and replays the winner", async () => {
    const startsAt = new Date("2026-11-11T06:15:00.000Z");
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        createBooking(
          context,
          {
            idempotencyKey: `concurrent-create-${index}`.padEnd(16, "0"),
            locationId,
            source: "appointment",
            status: "confirmed",
            guest,
            selections: selection(),
            startsAt
          },
          { clock }
        )
      )
    );
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const winner = (
      attempts.find(({ status }) => status === "fulfilled") as PromiseFulfilledResult<
        Awaited<ReturnType<typeof createBooking>>
      >
    ).value;
    const winnerIndex = attempts.findIndex(({ status }) => status === "fulfilled");
    const replay = await createBooking(
      context,
      {
        idempotencyKey: `concurrent-create-${winnerIndex}`.padEnd(16, "0"),
        locationId,
        source: "appointment",
        status: "confirmed",
        guest,
        selections: selection(),
        startsAt
      },
      { clock }
    );
    expect(replay).toMatchObject({ replay: true, booking: { id: winner.booking.id } });
    expect(
      await BookingModel.countDocuments({
        tenantId: new Types.ObjectId(tenantId),
        status: "confirmed"
      })
    ).toBe(1);
    expect(
      await MutationReceiptModel.countDocuments({
        tenantId: new Types.ObjectId(tenantId),
        status: "succeeded"
      })
    ).toBe(1);
    const conflictPlan = await BookingModel.find({
      tenantId: new Types.ObjectId(tenantId),
      status: { $in: ["confirmed", "in_progress"] },
      deletedAt: null,
      "lines.assignedStaffProfileId": new Types.ObjectId(staffProfileId),
      startsAt: { $lt: new Date("2026-11-11T08:00:00.000Z") },
      endsAt: { $gt: new Date("2026-11-11T05:00:00.000Z") }
    }).explain("executionStats");
    expect(
      JSON.stringify(
        (conflictPlan as unknown as { queryPlanner: { winningPlan: unknown } }).queryPlanner
          .winningPlan
      )
    ).toContain("tenant_staff_utc_conflicts");

    const nonOverlapping = await Promise.all(
      ["06:15:00.000Z", "09:15:00.000Z"].map((time, index) =>
        createBooking(
          context,
          {
            idempotencyKey: `non-overlap-create-${index}`,
            locationId,
            source: "appointment",
            status: "confirmed",
            guest,
            selections: selection(),
            startsAt: new Date(`2026-11-12T${time}`)
          },
          { clock }
        )
      )
    );
    expect(nonOverlapping).toHaveLength(2);
  });

  it("builds buffered sequential lines for the same or different staff", async () => {
    const stylistTwo = await userRepository.create({ id: newId(), displayName: "Stylist two" });
    const membershipTwo = await membershipRepository.create(context, {
      userId: stylistTwo.id,
      roleKeys: ["stylist"]
    });
    const profileTwo = await staffBookingProfileRepository.create(context, {
      membershipId: membershipTwo.id,
      displayName: "Stylist two"
    });
    const profileTwoId = profileTwo.id as string;
    await staffBookingProfileRepository.setScheduleMode(context, profileTwoId, "inherit_location");
    await bookingConfigurationRepository.assignLocation(context, {
      staffProfileId: profileTwoId,
      locationId
    });
    await bookingConfigurationRepository.setServiceEligibility(context, {
      staffProfileId: profileTwoId,
      serviceId
    });
    for (const assignedStaffProfileId of [staffProfileId, profileTwoId]) {
      const availability = await queryBookingAvailability(
        context,
        {
          locationId,
          localDate: "2026-11-13",
          selections: [
            { serviceId, assignedStaffProfileId: staffProfileId },
            { serviceId, assignedStaffProfileId }
          ],
          limit: 1
        },
        { clock }
      );
      const [first, second] = availability.slots[0]!.lines;
      expect(first!.bufferedEndsAt <= second!.bufferedStartsAt).toBe(true);
      expect(second!.startsAt.getTime() - first!.endsAt.getTime()).toBe(30 * 60_000);
    }
  });

  it("locks every UTC day crossed by a persisted multi-line booking", async () => {
    await bookingScheduleRepository.setDateOverride(context, {
      ownerType: "location",
      ownerId: locationId,
      timezone: "Africa/Nairobi",
      localDate: "2026-11-16",
      intervals: [{ startMinute: 0, endMinute: 300 }]
    });
    const attempts = await Promise.allSettled(
      ["cross-midnight-001", "cross-midnight-002"].map((idempotencyKey) =>
        createBooking(
          context,
          {
            idempotencyKey,
            locationId,
            source: "appointment",
            status: "confirmed",
            guest,
            selections: [...selection(), ...selection()],
            startsAt: new Date("2026-11-15T21:30:00.000Z")
          },
          { clock }
        )
      )
    );
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const created = attempts.find(
      (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof createBooking>>> =>
        attempt.status === "fulfilled"
    )!.value;
    expect(created.booking.lines.at(-1)!.endsAt.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    const lockedDates = await StaffDayLockModel.find({
      tenantId: new Types.ObjectId(tenantId),
      staffProfileId: new Types.ObjectId(staffProfileId)
    }).distinct("utcDate");
    expect(lockedDates.sort()).toEqual(["2026-11-15", "2026-11-16"]);
  });

  it("prevents cross-location staff overlap and serializes offering changes", async () => {
    const secondLocation = await locationRepository.create(context, {
      id: newId(),
      name: "Westlands salon",
      timezone: "Africa/Nairobi"
    });
    await bookingConfigurationRepository.assignLocation(context, {
      staffProfileId,
      locationId: secondLocation.id
    });
    await bookingConfigurationRepository.configureOffering(context, {
      serviceId,
      locationId: secondLocation.id,
      durationMinutes: 60,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
      quotedPriceMinor: 250000,
      slotIncrementMinutes: 15,
      minAdvanceMinutes: 0,
      maxAdvanceDays: 30
    });
    await bookingScheduleRepository.createWeeklyScheduleSuccessor(context, {
      ownerType: "location",
      ownerId: secondLocation.id,
      timezone: "Africa/Nairobi",
      effectiveFrom: "2026-11-01",
      week
    });
    const startsAt = new Date("2026-11-14T06:15:00.000Z");
    const crossLocation = await Promise.allSettled(
      [locationId, secondLocation.id].map((targetLocationId, index) =>
        createBooking(
          context,
          {
            idempotencyKey: `cross-location-${index}`.padEnd(16, "0"),
            locationId: targetLocationId,
            source: "appointment",
            status: "confirmed",
            guest,
            selections: selection(),
            startsAt
          },
          { clock }
        )
      )
    );
    expect(crossLocation.filter(({ status }) => status === "fulfilled")).toHaveLength(1);

    let releasePreview!: () => void;
    let signalPreview!: () => void;
    const previewReached = new Promise<void>((resolve) => {
      signalPreview = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releasePreview = resolve;
    });
    const racingBooking = createBooking(
      context,
      {
        idempotencyKey: "offering-race-book",
        locationId,
        source: "appointment",
        status: "confirmed",
        guest,
        selections: selection(),
        startsAt: new Date("2026-11-15T06:15:00.000Z")
      },
      {
        clock,
        afterPreview: async () => {
          signalPreview();
          await release;
        }
      }
    );
    await previewReached;
    await bookingConfigurationRepository.archiveOffering(context, { serviceId, locationId });
    releasePreview();
    await expect(racingBooking).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("reschedules atomically, advances event/version sequence and hides cross-tenant bookings", async () => {
    const created = await createBooking(
      context,
      {
        idempotencyKey: "reschedule-create-1",
        locationId,
        source: "appointment",
        status: "confirmed",
        guest,
        selections: selection(),
        startsAt: new Date("2026-11-12T06:15:00.000Z")
      },
      { clock }
    );
    await expect(
      rescheduleBooking(
        otherContext,
        {
          bookingId: created.booking.id,
          expectedVersion: 0,
          idempotencyKey: "cross-tenant-resch",
          reasonCode: "guest_request",
          startsAt: new Date("2026-11-12T08:15:00.000Z"),
          selections: selection()
        },
        { clock }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const moved = await rescheduleBooking(
      context,
      {
        bookingId: created.booking.id,
        expectedVersion: 0,
        idempotencyKey: "reschedule-command1",
        reasonCode: "guest_request",
        note: "Requested a later time",
        startsAt: new Date("2026-11-12T08:15:00.000Z"),
        selections: selection()
      },
      { clock }
    );
    expect(moved.booking).toMatchObject({ version: 1, status: "confirmed" });
    expect(moved.booking.guest).toEqual(created.booking.guest);
    expect(
      await BookingEventModel.find({
        tenantId: new Types.ObjectId(tenantId),
        bookingId: new Types.ObjectId(created.booking.id)
      })
        .sort({ sequence: 1 })
        .select({ sequence: 1, eventType: 1, bookingVersion: 1, _id: 0 })
        .lean()
    ).toEqual([
      { sequence: 0, eventType: "created", bookingVersion: 0 },
      { sequence: 1, eventType: "rescheduled", bookingVersion: 1 }
    ]);
    expect(
      await StaffDayLockModel.countDocuments({
        tenantId: new Types.ObjectId(tenantId),
        staffProfileId: new Types.ObjectId(staffProfileId)
      })
    ).toBeGreaterThan(0);
  });

  it("reschedules with the current authoritative location timezone", async () => {
    const created = await createBooking(
      context,
      {
        idempotencyKey: "timezone-create-01",
        locationId,
        source: "appointment",
        status: "confirmed",
        guest,
        selections: selection(),
        startsAt: new Date("2026-11-12T06:15:00.000Z")
      },
      { clock }
    );
    await locationRepository.update(context, locationId, { timezone: "Pacific/Kiritimati" });
    await bookingScheduleRepository.createWeeklyScheduleSuccessor(context, {
      ownerType: "location",
      ownerId: locationId,
      timezone: "Pacific/Kiritimati",
      effectiveFrom: "2026-11-13",
      week
    });

    const moved = await rescheduleBooking(
      context,
      {
        bookingId: created.booking.id,
        expectedVersion: 0,
        idempotencyKey: "timezone-resched-1",
        reasonCode: "scheduling_correction",
        startsAt: new Date("2026-11-13T19:15:00.000Z"),
        selections: selection()
      },
      { clock }
    );
    expect(moved.booking).toMatchObject({
      timezone: "Pacific/Kiritimati",
      localDate: "2026-11-14",
      version: 1
    });
  });

  it("serializes concurrent reschedules across the old and new UTC-day lock union", async () => {
    const created = await createBooking(
      context,
      {
        idempotencyKey: "union-resched-create",
        locationId,
        source: "appointment",
        status: "confirmed",
        guest,
        selections: selection(),
        startsAt: new Date("2026-11-12T06:15:00.000Z")
      },
      { clock }
    );
    const attempts = await Promise.allSettled(
      ["2026-11-13T06:15:00.000Z", "2026-11-14T06:15:00.000Z"].map((startsAt, index) =>
        rescheduleBooking(
          context,
          {
            bookingId: created.booking.id,
            expectedVersion: 0,
            idempotencyKey: `union-reschedule-${index}`,
            reasonCode: "guest_request",
            startsAt: new Date(startsAt),
            selections: selection()
          },
          { clock }
        )
      )
    );
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const winner = attempts.find(
      (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof rescheduleBooking>>> =>
        attempt.status === "fulfilled"
    )!.value;
    const lockedDates = await StaffDayLockModel.find({
      tenantId: new Types.ObjectId(tenantId),
      staffProfileId: new Types.ObjectId(staffProfileId)
    }).distinct("utcDate");
    expect(lockedDates).toContain("2026-11-12");
    expect(lockedDates).toContain(winner.booking.lines[0]!.startsAt.toISOString().slice(0, 10));
  });

  it("uses typed errors without leaking a forged tenant id", async () => {
    try {
      await confirmBooking(
        otherContext,
        { bookingId: newId(), expectedVersion: 0, idempotencyKey: "forged-confirm-id" },
        { clock }
      );
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseCommandError);
      expect((error as DatabaseCommandError).code).toBe("NOT_FOUND");
    }
  });
});
