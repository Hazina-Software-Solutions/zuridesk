import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import {
  BookingEventModel,
  BookingModel,
  MutationReceiptModel,
  ServiceLocationOfferingModel,
  ServiceModel,
  WeeklyScheduleVersionModel
} from "./phase4-models";

const id = () => new Types.ObjectId();
const week = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  intervals: weekday === 0 ? [] : [{ startMinute: 540, endMinute: 1_020 }]
}));

function booking(overrides: Record<string, unknown> = {}) {
  return new BookingModel({
    schemaVersion: 1,
    tenantId: id(),
    locationId: id(),
    localDate: "2026-11-04",
    timezone: "Africa/Nairobi",
    startsAt: new Date("2026-11-04T05:50:00.000Z"),
    endsAt: new Date("2026-11-04T07:10:00.000Z"),
    status: "pending",
    version: 0,
    source: "appointment",
    guest: { kind: "named", displayName: "Guest", customerId: null },
    lines: [
      {
        order: 0,
        serviceId: id(),
        serviceName: "Braids",
        assignedStaffProfileId: id(),
        durationMinutes: 60,
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 10,
        quotedPriceMinor: 10000,
        startsAt: new Date("2026-11-04T06:00:00.000Z"),
        endsAt: new Date("2026-11-04T07:00:00.000Z"),
        status: "scheduled",
        skippedReasonCode: null
      }
    ],
    deletedAt: null,
    ...overrides
  });
}

describe("Phase 4.1 strict models", () => {
  it("rejects unknown fields and incomplete archive lifecycles", async () => {
    expect(
      () =>
        new ServiceModel({
          schemaVersion: 1,
          tenantId: id(),
          name: "Braids",
          status: "active",
          archivedAt: null,
          unexpected: true
        })
    ).toThrow(/strict mode/i);
    const service = new ServiceModel({
      schemaVersion: 1,
      tenantId: id(),
      name: "Braids",
      status: "archived",
      archivedAt: null
    });
    await expect(service.validate()).rejects.toThrow("Archived records require archivedAt");
  });

  it("validates effective-dated weekly schedules and IANA timezones", async () => {
    const schedule = new WeeklyScheduleVersionModel({
      schemaVersion: 1,
      tenantId: id(),
      ownerType: "location",
      ownerId: id(),
      timezone: "Not/A_Timezone",
      effectiveFrom: "2026-11-10",
      effectiveTo: "2026-11-30",
      week,
      createdByUserId: id(),
      archivedAt: null
    });
    await expect(schedule.validate()).rejects.toThrow("IANA timezone");
    schedule.timezone = "Africa/Nairobi";
    schedule.effectiveTo = "2026-11-01";
    await expect(schedule.validate()).rejects.toThrow("effectiveTo cannot precede");
  });

  it("derives local dates and enforces exact duration and buffered aggregate ranges", async () => {
    await expect(booking().validate()).resolves.toBeUndefined();
    await expect(booking({ localDate: "2026-11-03" }).validate()).rejects.toThrow(
      "localDate must derive"
    );
    const wrongDuration = booking();
    wrongDuration.lines[0]!.durationMinutes = 59;
    await expect(wrongDuration.validate()).rejects.toThrow("exactly match durationMinutes");
    await expect(
      booking({ startsAt: new Date("2026-11-04T06:00:00.000Z") }).validate()
    ).rejects.toThrow("exactly cover buffered");
  });

  it("allows ordered gaps but rejects buffered overlap and non-contiguous ordering", async () => {
    const first = booking().toObject().lines[0]!;
    const second = {
      ...first,
      order: 1,
      serviceId: id(),
      assignedStaffProfileId: id(),
      startsAt: new Date("2026-11-04T08:00:00.000Z"),
      endsAt: new Date("2026-11-04T09:00:00.000Z")
    };
    await expect(
      booking({ lines: [first, second], endsAt: new Date("2026-11-04T09:10:00.000Z") }).validate()
    ).resolves.toBeUndefined();
    second.startsAt = new Date("2026-11-04T07:05:00.000Z");
    second.endsAt = new Date("2026-11-04T08:05:00.000Z");
    await expect(
      booking({ lines: [first, second], endsAt: new Date("2026-11-04T08:15:00.000Z") }).validate()
    ).rejects.toThrow("must not overlap");
    second.order = 2;
    second.startsAt = new Date("2026-11-04T08:00:00.000Z");
    second.endsAt = new Date("2026-11-04T09:00:00.000Z");
    await expect(
      booking({ lines: [first, second], endsAt: new Date("2026-11-04T09:10:00.000Z") }).validate()
    ).rejects.toThrow("order must be contiguous");
  });

  it("enforces skipped reasons and aggregate/line lifecycle invariants", async () => {
    const pendingProgress = booking();
    pendingProgress.lines[0]!.status = "in_progress";
    await expect(pendingProgress.validate()).rejects.toThrow("pending bookings require");
    const skippedWithoutReason = booking({ status: "completed" });
    skippedWithoutReason.lines[0]!.status = "skipped";
    await expect(skippedWithoutReason.validate()).rejects.toThrow("skippedReasonCode");
    const scheduledWithReason = booking();
    scheduledWithReason.lines[0]!.skippedReasonCode = "not_available";
    await expect(scheduledWithReason.validate()).rejects.toThrow("skippedReasonCode");
    const completed = booking({ status: "completed" });
    completed.lines[0]!.status = "completed";
    await expect(completed.validate()).resolves.toBeUndefined();
  });

  it("keeps customerId null and numeric configuration values safe and grid-aligned", async () => {
    const withCustomer = booking();
    withCustomer.guest.customerId = id();
    await expect(withCustomer.validate()).rejects.toThrow(/customerId/);
    const offering = (slotIncrementMinutes: number, quotedPriceMinor = 10000) =>
      new ServiceLocationOfferingModel({
        schemaVersion: 1,
        tenantId: id(),
        serviceId: id(),
        locationId: id(),
        durationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        quotedPriceMinor,
        slotIncrementMinutes,
        minAdvanceMinutes: 0,
        maxAdvanceDays: 30,
        status: "active",
        archivedAt: null
      });
    await expect(offering(7).validate()).rejects.toThrow("divide a 24-hour day");
    await expect(offering(15.5).validate()).rejects.toThrow("safe integer");
    await expect(offering(15, Number.MAX_SAFE_INTEGER + 1).validate()).rejects.toThrow();
  });

  it("validates event type, reason, line scope and status transitions", async () => {
    const event = (overrides: Record<string, unknown> = {}) =>
      new BookingEventModel({
        schemaVersion: 1,
        tenantId: id(),
        bookingId: id(),
        sequence: 0,
        eventType: "created",
        actorUserId: id(),
        occurredAt: new Date(),
        reasonCode: null,
        note: null,
        fromStatus: null,
        toStatus: "pending",
        lineOrder: null,
        bookingVersion: 0,
        ...overrides
      });
    await expect(event().validate()).resolves.toBeUndefined();
    await expect(event({ eventType: "invented" }).validate()).rejects.toThrow();
    await expect(event({ eventType: "cancelled" }).validate()).rejects.toThrow("reasonCode");
    await expect(
      event({ eventType: "line_started", fromStatus: null, toStatus: null }).validate()
    ).rejects.toThrow("lineOrder");
    await expect(
      event({ fromStatus: "pending", toStatus: "completed" }).validate()
    ).rejects.toThrow("transition");
  });

  it("enforces mutation receipt terminal and entity invariants", async () => {
    const receipt = new MutationReceiptModel({
      schemaVersion: 1,
      tenantId: id(),
      actorUserId: id(),
      operation: "booking.create",
      idempotencyKey: "client-key-00000001",
      requestHash: "a".repeat(64),
      status: "succeeded",
      entityType: null,
      entityId: null,
      expectedVersion: 0,
      completedAt: null
    });
    await expect(receipt.validate()).rejects.toThrow("require completedAt");
    receipt.completedAt = new Date();
    receipt.entityType = "booking";
    await expect(receipt.validate()).rejects.toThrow("must be set together");
  });
});
