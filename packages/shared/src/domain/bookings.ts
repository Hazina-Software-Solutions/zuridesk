import { z } from "zod";

import { e164PhoneNumberSchema, normalizedEmailSchema } from "./contact";
import { moneyMinorSchema } from "./money";
import { objectIdSchema } from "../ids";

const safeInteger = (minimum: number, maximum: number) =>
  z.number().int().safe().min(minimum).max(maximum);
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const bookingStatusSchema = z.enum([
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "no_show",
  "cancelled"
]);
export const bookingLineStatusSchema = z.enum(["scheduled", "in_progress", "completed", "skipped"]);
export const scheduleOwnerTypeSchema = z.enum(["location", "staff"]);
export const staffScheduleModeSchema = z.enum(["unconfigured", "inherit_location", "custom"]);
export const bookingEventTypeSchema = z.enum([
  "created",
  "confirmed",
  "rescheduled",
  "started",
  "line_started",
  "line_completed",
  "line_skipped",
  "completed",
  "no_show",
  "cancelled"
]);

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO local date")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month! - 1 &&
      date.getUTCDate() === day
    );
  }, "must be a valid calendar date");

export const minuteOfDaySchema = z.number().int().min(0).max(1_440);
export const scheduleIntervalSchema = z
  .object({ startMinute: minuteOfDaySchema.max(1_439), endMinute: minuteOfDaySchema.min(1) })
  .strict()
  .refine(({ startMinute, endMinute }) => startMinute < endMinute, {
    message: "schedule intervals must be non-empty and half-open"
  });

export const scheduleIntervalsSchema = z
  .array(scheduleIntervalSchema)
  .max(12)
  .superRefine((intervals, context) => {
    const sorted = [...intervals].sort((left, right) => left.startMinute - right.startMinute);
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index]!.startMinute < sorted[index - 1]!.endMinute) {
        context.addIssue({ code: "custom", message: "schedule intervals must not overlap" });
        return;
      }
    }
  });

export const weeklyScheduleSchema = z
  .array(
    z
      .object({
        weekday: z.number().int().min(0).max(6),
        intervals: scheduleIntervalsSchema
      })
      .strict()
  )
  .length(7)
  .refine((days) => new Set(days.map(({ weekday }) => weekday)).size === 7, {
    message: "weekly schedules require each weekday exactly once"
  });

export const guestSnapshotSchema = z
  .object({
    kind: z.enum(["named", "anonymous"]),
    displayName: z.string().trim().min(1).max(120),
    phone: e164PhoneNumberSchema.optional(),
    email: normalizedEmailSchema.optional(),
    customerId: z.null()
  })
  .strict()
  .superRefine((guest, context) => {
    if (guest.kind === "anonymous" && (guest.phone !== undefined || guest.email !== undefined)) {
      context.addIssue({ code: "custom", message: "anonymous guests cannot include contact data" });
    }
  });

export const bookingLineSnapshotSchema = z
  .object({
    order: safeInteger(0, 99),
    serviceId: objectIdSchema,
    serviceName: z.string().trim().min(1).max(120),
    assignedStaffProfileId: objectIdSchema,
    durationMinutes: safeInteger(1, 1_440),
    bufferBeforeMinutes: safeInteger(0, 240),
    bufferAfterMinutes: safeInteger(0, 240),
    quotedPriceMinor: moneyMinorSchema,
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    status: bookingLineStatusSchema,
    skippedReasonCode: z.string().trim().min(1).max(64).nullable()
  })
  .strict()
  .superRefine((line, context) => {
    if (line.startsAt >= line.endsAt) {
      context.addIssue({ code: "custom", message: "booking line end must be after start" });
    } else if (line.endsAt.getTime() - line.startsAt.getTime() !== line.durationMinutes * 60_000) {
      context.addIssue({
        code: "custom",
        message: "booking line time range must exactly match durationMinutes"
      });
    }
    if ((line.status === "skipped") !== (line.skippedReasonCode !== null)) {
      context.addIssue({
        code: "custom",
        message: "skippedReasonCode is required exactly when a line is skipped"
      });
    }
  });

export const serviceCreateInputSchema = z
  .object({
    id: objectIdSchema.optional(),
    name: boundedText(120),
    description: boundedText(500).nullable().optional()
  })
  .strict();
export const serviceUpdateInputSchema = z
  .object({
    name: boundedText(120).optional(),
    description: boundedText(500).nullable().optional()
  })
  .strict()
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: "at least one service field is required"
  });
export const staffBookingProfileCreateInputSchema = z
  .object({
    id: objectIdSchema.optional(),
    membershipId: objectIdSchema,
    displayName: boundedText(120)
  })
  .strict();
export const locationAccessInputSchema = z
  .object({ targetMembershipId: objectIdSchema, locationId: objectIdSchema })
  .strict();
export const staffLocationInputSchema = z
  .object({ staffProfileId: objectIdSchema, locationId: objectIdSchema })
  .strict();
export const staffServiceInputSchema = z
  .object({ staffProfileId: objectIdSchema, serviceId: objectIdSchema })
  .strict();
export const serviceOfferingInputSchema = z
  .object({
    serviceId: objectIdSchema,
    locationId: objectIdSchema,
    durationMinutes: safeInteger(1, 1_440),
    bufferBeforeMinutes: safeInteger(0, 240),
    bufferAfterMinutes: safeInteger(0, 240),
    quotedPriceMinor: moneyMinorSchema,
    slotIncrementMinutes: safeInteger(1, 240).refine((value) => 1_440 % value === 0, {
      message: "slot increment must divide a 24-hour day"
    }),
    minAdvanceMinutes: safeInteger(0, 525_600),
    maxAdvanceDays: safeInteger(0, 730)
  })
  .strict();
export const weeklyScheduleSuccessorInputSchema = z
  .object({
    ownerType: scheduleOwnerTypeSchema,
    ownerId: objectIdSchema,
    timezone: boundedText(64),
    effectiveFrom: localDateSchema,
    week: weeklyScheduleSchema
  })
  .strict();
export const dateOverrideInputSchema = z
  .object({
    ownerType: scheduleOwnerTypeSchema,
    ownerId: objectIdSchema,
    timezone: boundedText(64),
    localDate: localDateSchema,
    intervals: scheduleIntervalsSchema
  })
  .strict();
export const dateOverrideIdentitySchema = z
  .object({
    ownerType: scheduleOwnerTypeSchema,
    ownerId: objectIdSchema,
    localDate: localDateSchema
  })
  .strict();
export const unavailabilityInputSchema = z
  .object({
    staffProfileId: objectIdSchema,
    startsAt: z.date(),
    endsAt: z.date(),
    reasonCode: boundedText(64)
  })
  .strict()
  .refine(({ startsAt, endsAt }) => startsAt < endsAt, {
    message: "unavailability end must be after start"
  });
export const bufferedOccupancyInputSchema = z
  .object({
    staffProfileId: objectIdSchema,
    bufferedStartsAt: z.date(),
    bufferedEndsAt: z.date()
  })
  .strict()
  .refine(({ bufferedStartsAt, bufferedEndsAt }) => bufferedStartsAt < bufferedEndsAt, {
    message: "buffered occupancy end must be after start"
  });
export const mutationClaimInputSchema = z
  .object({
    operation: boundedText(64),
    idempotencyKey: z.string().trim().min(16).max(128),
    requestHash: z.string().regex(/^[0-9a-f]{64}$/),
    expectedVersion: safeInteger(0, Number.MAX_SAFE_INTEGER).nullable().optional()
  })
  .strict();
export const mutationCompletionInputSchema = z
  .object({
    receiptId: objectIdSchema,
    status: z.enum(["succeeded", "conflict", "failed"]),
    entityType: boundedText(64).nullable().optional(),
    entityId: objectIdSchema.nullable().optional()
  })
  .strict()
  .refine(({ entityId, entityType }) => (entityId == null) === (entityType == null), {
    message: "entityType and entityId must be provided together"
  });

export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type BookingLineStatus = z.infer<typeof bookingLineStatusSchema>;
export type ScheduleOwnerType = z.infer<typeof scheduleOwnerTypeSchema>;
export type StaffScheduleMode = z.infer<typeof staffScheduleModeSchema>;
export type ScheduleInterval = z.infer<typeof scheduleIntervalSchema>;
export type WeeklySchedule = z.infer<typeof weeklyScheduleSchema>;
export type GuestSnapshot = z.infer<typeof guestSnapshotSchema>;
export type BookingLineSnapshot = z.infer<typeof bookingLineSnapshotSchema>;
export type BookingEventType = z.infer<typeof bookingEventTypeSchema>;
