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
    startsAt: z.date(),
    endsAt: z.date(),
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

export const bookingSelectionSchema = z
  .object({
    serviceId: objectIdSchema,
    assignedStaffProfileId: objectIdSchema
  })
  .strict();

export const bookingSelectionsSchema = z.array(bookingSelectionSchema).min(1).max(100);

export const availabilityQuerySchema = z
  .object({
    locationId: objectIdSchema,
    localDate: localDateSchema,
    selections: bookingSelectionsSchema,
    limit: safeInteger(1, 500).optional()
  })
  .strict();

export const availabilityReasonSchema = z.enum([
  "LOCATION_UNAVAILABLE",
  "SERVICE_UNAVAILABLE",
  "STAFF_UNAVAILABLE",
  "SCHEDULE_UNCONFIGURED",
  "NO_CAPACITY"
]);

export const availabilityLineSchema = z
  .object({
    order: safeInteger(0, 99),
    serviceId: objectIdSchema,
    assignedStaffProfileId: objectIdSchema,
    startsAt: z.date(),
    endsAt: z.date(),
    bufferedStartsAt: z.date(),
    bufferedEndsAt: z.date()
  })
  .strict();

export const availabilitySlotSchema = z
  .object({
    startsAt: z.date(),
    endsAt: z.date(),
    lines: z.array(availabilityLineSchema).min(1).max(100)
  })
  .strict();

export const availabilityResultSchema = z
  .object({
    locationId: objectIdSchema,
    localDate: localDateSchema,
    timezone: boundedText(64),
    evaluatedAt: z.date(),
    guardVersions: z.array(
      z
        .object({
          scopeType: z.enum(["location", "staff"]),
          scopeId: objectIdSchema,
          version: safeInteger(0, Number.MAX_SAFE_INTEGER)
        })
        .strict()
    ),
    slots: z.array(availabilitySlotSchema).max(500),
    reasons: z.array(availabilityReasonSchema).max(10)
  })
  .strict();

export const createBookingCommandSchema = z
  .object({
    idempotencyKey: z.string().trim().min(16).max(128),
    locationId: objectIdSchema,
    source: z.enum(["appointment", "walk_in"]),
    status: z.enum(["pending", "confirmed"]).default("confirmed"),
    guest: guestSnapshotSchema,
    selections: bookingSelectionsSchema,
    startsAt: z.coerce.date().optional()
  })
  .strict()
  .superRefine((input, context) => {
    if ((input.source === "appointment") !== (input.startsAt !== undefined)) {
      context.addIssue({
        code: "custom",
        message: "appointments require startsAt and walk-ins derive startsAt from the server clock"
      });
    }
    if (input.source === "appointment" && input.guest.kind !== "named") {
      context.addIssue({ code: "custom", message: "appointments require a named guest" });
    }
  });

export const confirmBookingCommandSchema = z
  .object({
    bookingId: objectIdSchema,
    expectedVersion: safeInteger(0, Number.MAX_SAFE_INTEGER),
    idempotencyKey: z.string().trim().min(16).max(128)
  })
  .strict();

export const bookingRescheduleReasonSchema = z.enum([
  "guest_request",
  "staff_unavailable",
  "business_disruption",
  "scheduling_correction",
  "other"
]);

export const rescheduleBookingCommandSchema = z
  .object({
    bookingId: objectIdSchema,
    expectedVersion: safeInteger(0, Number.MAX_SAFE_INTEGER),
    idempotencyKey: z.string().trim().min(16).max(128),
    reasonCode: bookingRescheduleReasonSchema,
    note: z.string().trim().min(1).max(500).optional(),
    startsAt: z.coerce.date(),
    selections: bookingSelectionsSchema
  })
  .strict();

export const bookingDtoSchema = z
  .object({
    id: objectIdSchema,
    locationId: objectIdSchema,
    localDate: localDateSchema,
    timezone: boundedText(64),
    startsAt: z.date(),
    endsAt: z.date(),
    status: bookingStatusSchema,
    version: safeInteger(0, Number.MAX_SAFE_INTEGER),
    source: z.enum(["appointment", "walk_in"]),
    guest: guestSnapshotSchema,
    lines: z.array(bookingLineSnapshotSchema).min(1).max(100)
  })
  .strict();

export const bookingCommandResultSchema = z
  .object({ replay: z.boolean(), booking: bookingDtoSchema })
  .strict();

const bookingMutationIdentity = {
  bookingId: objectIdSchema,
  expectedVersion: safeInteger(0, Number.MAX_SAFE_INTEGER),
  idempotencyKey: z.string().trim().min(16).max(128)
} as const;

export const startBookingCommandSchema = z.object(bookingMutationIdentity).strict();
export const completeBookingCommandSchema = z.object(bookingMutationIdentity).strict();
export const bookingLineMutationCommandSchema = z
  .object({
    ...bookingMutationIdentity,
    lineOrder: safeInteger(0, 99)
  })
  .strict();

export const bookingLineSkipReasonSchema = z.enum([
  "guest_declined",
  "service_unavailable",
  "staff_decision",
  "safety_concern",
  "other"
]);
export const skipBookingLineCommandSchema = z
  .object({
    ...bookingMutationIdentity,
    lineOrder: safeInteger(0, 99),
    reasonCode: bookingLineSkipReasonSchema,
    note: z.string().trim().min(1).max(500).optional()
  })
  .strict();

export const bookingNoShowReasonSchema = z.enum(["guest_absent", "unable_to_contact"]);
export const markBookingNoShowCommandSchema = z
  .object({
    ...bookingMutationIdentity,
    reasonCode: bookingNoShowReasonSchema,
    note: z.string().trim().min(1).max(500).optional()
  })
  .strict();

export const bookingCancellationReasonSchema = z.enum([
  "guest_request",
  "staff_unavailable",
  "business_disruption",
  "duplicate",
  "other"
]);
export const cancelBookingCommandSchema = z
  .object({
    ...bookingMutationIdentity,
    reasonCode: bookingCancellationReasonSchema,
    note: z.string().trim().min(1).max(500).optional()
  })
  .strict();

export const bookingListQuerySchema = z
  .object({
    status: bookingStatusSchema.optional(),
    locationId: objectIdSchema.optional(),
    localDateFrom: localDateSchema.optional(),
    localDateTo: localDateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100)
  })
  .strict()
  .refine(
    ({ localDateFrom, localDateTo }) =>
      localDateFrom === undefined || localDateTo === undefined || localDateFrom <= localDateTo,
    { message: "localDateFrom cannot be after localDateTo" }
  );

export const bookingListResultSchema = z
  .object({ bookings: z.array(bookingDtoSchema).max(200) })
  .strict();

export const serviceDtoSchema = z
  .object({
    id: objectIdSchema,
    name: boundedText(120),
    description: boundedText(500).nullable()
  })
  .strict();

export const bookingCatalogueStaffSchema = z
  .object({ id: objectIdSchema, displayName: boundedText(120) })
  .strict();
export const bookingCatalogueOfferingSchema = z
  .object({
    durationMinutes: safeInteger(1, 1_440),
    bufferBeforeMinutes: safeInteger(0, 240),
    bufferAfterMinutes: safeInteger(0, 240),
    quotedPriceMinor: moneyMinorSchema,
    slotIncrementMinutes: safeInteger(1, 240),
    minAdvanceMinutes: safeInteger(0, 525_600),
    maxAdvanceDays: safeInteger(0, 730)
  })
  .strict();
export const bookingCatalogueServiceSchema = serviceDtoSchema
  .extend({
    offering: bookingCatalogueOfferingSchema,
    eligibleStaff: z.array(bookingCatalogueStaffSchema).max(500)
  })
  .strict();
export const bookingCatalogueResultSchema = z
  .object({
    locationId: objectIdSchema,
    services: z.array(bookingCatalogueServiceSchema).max(500)
  })
  .strict();

export const bookingLocationDtoSchema = z
  .object({
    id: objectIdSchema,
    name: boundedText(120),
    timezone: boundedText(64)
  })
  .strict();
export const bookingLocationListResultSchema = z
  .object({ locations: z.array(bookingLocationDtoSchema).max(500) })
  .strict();

export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type BookingLocationDto = z.infer<typeof bookingLocationDtoSchema>;
export type BookingLocationListResult = z.infer<typeof bookingLocationListResultSchema>;
export type BookingLineStatus = z.infer<typeof bookingLineStatusSchema>;
export type ScheduleOwnerType = z.infer<typeof scheduleOwnerTypeSchema>;
export type StaffScheduleMode = z.infer<typeof staffScheduleModeSchema>;
export type ScheduleInterval = z.infer<typeof scheduleIntervalSchema>;
export type WeeklySchedule = z.infer<typeof weeklyScheduleSchema>;
export type GuestSnapshot = z.infer<typeof guestSnapshotSchema>;
export type BookingLineSnapshot = z.infer<typeof bookingLineSnapshotSchema>;
export type BookingEventType = z.infer<typeof bookingEventTypeSchema>;
export type BookingSelection = z.input<typeof bookingSelectionSchema>;
export type AvailabilityQuery = z.input<typeof availabilityQuerySchema>;
export type AvailabilityResult = z.infer<typeof availabilityResultSchema>;
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;
export type CreateBookingCommand = z.input<typeof createBookingCommandSchema>;
export type ConfirmBookingCommand = z.input<typeof confirmBookingCommandSchema>;
export type RescheduleBookingCommand = z.input<typeof rescheduleBookingCommandSchema>;
export type BookingCommandResult = z.infer<typeof bookingCommandResultSchema>;
export type BookingDto = z.infer<typeof bookingDtoSchema>;
export type BookingRescheduleReason = z.infer<typeof bookingRescheduleReasonSchema>;
export type StartBookingCommand = z.input<typeof startBookingCommandSchema>;
export type CompleteBookingCommand = z.input<typeof completeBookingCommandSchema>;
export type BookingLineMutationCommand = z.input<typeof bookingLineMutationCommandSchema>;
export type SkipBookingLineCommand = z.input<typeof skipBookingLineCommandSchema>;
export type MarkBookingNoShowCommand = z.input<typeof markBookingNoShowCommandSchema>;
export type CancelBookingCommand = z.input<typeof cancelBookingCommandSchema>;
export type BookingListQuery = z.input<typeof bookingListQuerySchema>;
export type BookingListResult = z.infer<typeof bookingListResultSchema>;
export type BookingCatalogueResult = z.infer<typeof bookingCatalogueResultSchema>;
export type ServiceDto = z.infer<typeof serviceDtoSchema>;
