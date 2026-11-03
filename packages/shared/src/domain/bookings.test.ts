import { describe, expect, it } from "vitest";

import {
  bookingLineSnapshotSchema,
  guestSnapshotSchema,
  localDateSchema,
  scheduleIntervalsSchema,
  serviceOfferingInputSchema,
  weeklyScheduleSchema
} from "./bookings";

const week = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  intervals: weekday === 0 ? [] : [{ startMinute: 540, endMinute: 720 }]
}));

describe("booking domain contracts", () => {
  it("accepts closed days and split shifts without persisted slots", () => {
    expect(weeklyScheduleSchema.parse(week)).toHaveLength(7);
    expect(
      scheduleIntervalsSchema.parse([
        { startMinute: 480, endMinute: 720 },
        { startMinute: 780, endMinute: 1_020 }
      ])
    ).toHaveLength(2);
  });

  it("rejects overlapping intervals, duplicate weekdays and impossible local dates", () => {
    expect(() =>
      scheduleIntervalsSchema.parse([
        { startMinute: 480, endMinute: 720 },
        { startMinute: 700, endMinute: 900 }
      ])
    ).toThrow("must not overlap");
    expect(() => weeklyScheduleSchema.parse(week.map((day) => ({ ...day, weekday: 1 })))).toThrow(
      "each weekday"
    );
    expect(() => localDateSchema.parse("2026-02-30")).toThrow("valid calendar date");
  });

  it("keeps anonymous walk-ins contact-free and validates immutable line snapshots", () => {
    expect(() =>
      guestSnapshotSchema.parse({
        kind: "anonymous",
        displayName: "Walk-in guest",
        phone: "+254700000001",
        customerId: null
      })
    ).toThrow("cannot include contact");
    expect(
      bookingLineSnapshotSchema.parse({
        order: 0,
        serviceId: "507f1f77bcf86cd799439011",
        serviceName: "Braids",
        assignedStaffProfileId: "507f1f77bcf86cd799439012",
        durationMinutes: 90,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 15,
        quotedPriceMinor: 250000,
        startsAt: "2026-11-04T06:00:00.000Z",
        endsAt: "2026-11-04T07:30:00.000Z",
        status: "scheduled",
        skippedReasonCode: null
      })
    ).toMatchObject({ durationMinutes: 90, quotedPriceMinor: 250000 });
    expect(() =>
      guestSnapshotSchema.parse({
        kind: "named",
        displayName: "Known guest",
        customerId: "507f1f77bcf86cd799439011"
      })
    ).toThrow();
  });

  it("rejects decimal, unsafe, invalid-grid and unknown configuration inputs", () => {
    const offering = {
      serviceId: "507f1f77bcf86cd799439011",
      locationId: "507f1f77bcf86cd799439012",
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 15,
      quotedPriceMinor: 250000,
      slotIncrementMinutes: 15,
      minAdvanceMinutes: 60,
      maxAdvanceDays: 90
    };
    expect(() =>
      serviceOfferingInputSchema.parse({ ...offering, durationMinutes: 60.5 })
    ).toThrow();
    expect(() =>
      serviceOfferingInputSchema.parse({
        ...offering,
        quotedPriceMinor: Number.MAX_SAFE_INTEGER + 1
      })
    ).toThrow();
    expect(() =>
      serviceOfferingInputSchema.parse({ ...offering, slotIncrementMinutes: 7 })
    ).toThrow("divide a 24-hour day");
    expect(() => serviceOfferingInputSchema.parse({ ...offering, surprise: true })).toThrow();
  });
});
