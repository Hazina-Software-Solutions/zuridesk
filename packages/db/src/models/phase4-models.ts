import {
  bookingEventTypeSchema,
  bookingLineSnapshotSchema,
  guestSnapshotSchema,
  localDateSchema,
  scheduleIntervalsSchema,
  weeklyScheduleSchema
} from "@zuridesk/shared";
import mongoose, { Schema, type HydratedDocument, type Model, type Types } from "mongoose";

const options = { strict: "throw" as const, timestamps: true as const, versionKey: false as const };
const tenantId = { type: Schema.Types.ObjectId, required: true, immutable: true } as const;
const objectId = { type: Schema.Types.ObjectId, required: true } as const;
const immutableObjectId = { ...objectId, immutable: true } as const;
const archivedAt = { type: Date, default: null } as const;
const schemaVersion = { type: Number, required: true, immutable: true, enum: [1] } as const;
const status = {
  type: String,
  required: true,
  enum: ["active", "archived"],
  default: "active"
} as const;

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const timezoneValidator = { validator: isTimezone, message: "must be an IANA timezone" };
const localDateValidator = {
  validator: (value: string | null) => value === null || localDateSchema.safeParse(value).success,
  message: "must be an ISO local date"
};
const safeIntegerValidator = {
  validator: (value: number) => Number.isSafeInteger(value),
  message: "must be a safe integer"
};
const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "no_show",
  "cancelled"
] as const;
const BOOKING_EVENT_TYPES = [
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
] as const;

interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}

interface TenantDocument extends Timestamped {
  _id: Types.ObjectId;
  schemaVersion: 1;
  tenantId: Types.ObjectId;
}

export interface ServiceDocument extends TenantDocument {
  name: string;
  description: string | null;
  status: "active" | "archived";
  archivedAt: Date | null;
}

export interface StaffBookingProfileDocument extends TenantDocument {
  membershipId: Types.ObjectId;
  displayName: string;
  scheduleMode: "unconfigured" | "inherit_location" | "custom";
  status: "active" | "archived";
  archivedAt: Date | null;
}

interface GrantDocument extends TenantDocument {
  targetMembershipId: Types.ObjectId;
  locationId: Types.ObjectId;
  grantedByUserId: Types.ObjectId;
  status: "active" | "revoked";
  revokedAt: Date | null;
}

interface AssignmentDocument extends TenantDocument {
  staffProfileId: Types.ObjectId;
  locationId: Types.ObjectId;
  status: "active" | "archived";
  archivedAt: Date | null;
}

interface EligibilityDocument extends TenantDocument {
  staffProfileId: Types.ObjectId;
  serviceId: Types.ObjectId;
  status: "active" | "archived";
  archivedAt: Date | null;
}

export interface ServiceLocationOfferingDocument extends TenantDocument {
  serviceId: Types.ObjectId;
  locationId: Types.ObjectId;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  quotedPriceMinor: number;
  slotIncrementMinutes: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  status: "active" | "archived";
  archivedAt: Date | null;
}

interface ScheduleIntervalDocument {
  startMinute: number;
  endMinute: number;
}

interface WeekdayScheduleDocument {
  weekday: number;
  intervals: ScheduleIntervalDocument[];
}

export interface WeeklyScheduleVersionDocument extends TenantDocument {
  ownerType: "location" | "staff";
  ownerId: Types.ObjectId;
  timezone: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  week: WeekdayScheduleDocument[];
  createdByUserId: Types.ObjectId;
  archivedAt: Date | null;
}

interface CalendarDateOverrideDocument extends TenantDocument {
  ownerType: "location" | "staff";
  ownerId: Types.ObjectId;
  timezone: string;
  localDate: string;
  intervals: ScheduleIntervalDocument[];
  createdByUserId: Types.ObjectId;
  archivedAt: Date | null;
}

interface StaffUnavailabilityDocument extends TenantDocument {
  staffProfileId: Types.ObjectId;
  startsAt: Date;
  endsAt: Date;
  reasonCode: string;
  authorizedByUserId: Types.ObjectId;
  archivedAt: Date | null;
}

interface GuestSnapshotDocument {
  kind: "named" | "anonymous";
  displayName: string;
  phone?: string;
  email?: string;
  customerId: Types.ObjectId | null;
}

interface BookingLineDocument {
  order: number;
  serviceId: Types.ObjectId;
  serviceName: string;
  assignedStaffProfileId: Types.ObjectId;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  quotedPriceMinor: number;
  startsAt: Date;
  endsAt: Date;
  status: "scheduled" | "in_progress" | "completed" | "skipped";
  skippedReasonCode: string | null;
}

export interface BookingDocument extends TenantDocument {
  locationId: Types.ObjectId;
  localDate: string;
  timezone: string;
  startsAt: Date;
  endsAt: Date;
  status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
  version: number;
  source: "appointment" | "walk_in";
  guest: GuestSnapshotDocument;
  lines: BookingLineDocument[];
  deletedAt: Date | null;
}

interface BookingEventDocument extends TenantDocument {
  bookingId: Types.ObjectId;
  sequence: number;
  eventType: (typeof BOOKING_EVENT_TYPES)[number];
  actorUserId: Types.ObjectId;
  occurredAt: Date;
  reasonCode: string | null;
  note: string | null;
  fromStatus: (typeof BOOKING_STATUSES)[number] | null;
  toStatus: (typeof BOOKING_STATUSES)[number] | null;
  lineOrder: number | null;
  bookingVersion: number;
}

interface ScheduleGuardDocument extends TenantDocument {
  scopeType: "location" | "staff";
  scopeId: Types.ObjectId;
  version: number;
}

interface StaffDayLockDocument extends TenantDocument {
  staffProfileId: Types.ObjectId;
  utcDate: string;
  version: number;
}

interface MutationReceiptDocument extends TenantDocument {
  actorUserId: Types.ObjectId;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
  status: "processing" | "succeeded" | "conflict" | "failed";
  entityType: string | null;
  entityId: Types.ObjectId | null;
  expectedVersion: number | null;
  completedAt: Date | null;
}

const intervalSchema = new Schema<ScheduleIntervalDocument>(
  {
    startMinute: {
      type: Number,
      required: true,
      min: 0,
      max: 1_439,
      validate: safeIntegerValidator
    },
    endMinute: {
      type: Number,
      required: true,
      min: 1,
      max: 1_440,
      validate: safeIntegerValidator
    }
  },
  { _id: false, strict: "throw" }
);
const weekdaySchema = new Schema<WeekdayScheduleDocument>(
  {
    weekday: { type: Number, required: true, min: 0, max: 6, validate: safeIntegerValidator },
    intervals: { type: [intervalSchema], required: true }
  },
  { _id: false, strict: "throw" }
);
const guestSchema = new Schema<GuestSnapshotDocument>(
  {
    kind: { type: String, required: true, enum: ["named", "anonymous"], immutable: true },
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
      immutable: true
    },
    phone: { type: String, match: /^\+[1-9]\d{7,14}$/, immutable: true },
    email: {
      type: String,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      immutable: true
    },
    customerId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
      validate: {
        validator: (value: Types.ObjectId | null) => value === null,
        message: "customerId must remain null until Phase 5"
      }
    }
  },
  { _id: false, strict: "throw" }
);
const bookingLineSchema = new Schema<BookingLineDocument>(
  {
    order: {
      type: Number,
      required: true,
      min: 0,
      max: 99,
      immutable: true,
      validate: safeIntegerValidator
    },
    serviceId: immutableObjectId,
    serviceName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
      immutable: true
    },
    assignedStaffProfileId: objectId,
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 1_440,
      immutable: true,
      validate: safeIntegerValidator
    },
    bufferBeforeMinutes: {
      type: Number,
      required: true,
      min: 0,
      max: 240,
      immutable: true,
      validate: safeIntegerValidator
    },
    bufferAfterMinutes: {
      type: Number,
      required: true,
      min: 0,
      max: 240,
      immutable: true,
      validate: safeIntegerValidator
    },
    quotedPriceMinor: {
      type: Number,
      required: true,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      immutable: true,
      validate: safeIntegerValidator
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ["scheduled", "in_progress", "completed", "skipped"]
    },
    skippedReasonCode: { type: String, default: null, maxlength: 64 }
  },
  { _id: false, strict: "throw" }
);

export const serviceSchema = new Schema<ServiceDocument>(
  {
    schemaVersion,
    tenantId,
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    description: { type: String, default: null, trim: true, maxlength: 500 },
    status,
    archivedAt
  },
  { ...options, collection: "services" }
);
serviceSchema.pre("validate", archiveLifecycle);

export const staffBookingProfileSchema = new Schema<StaffBookingProfileDocument>(
  {
    schemaVersion,
    tenantId,
    membershipId: immutableObjectId,
    displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    scheduleMode: {
      type: String,
      required: true,
      enum: ["unconfigured", "inherit_location", "custom"],
      default: "unconfigured"
    },
    status,
    archivedAt
  },
  { ...options, collection: "staff_booking_profiles" }
);
staffBookingProfileSchema.pre("validate", archiveLifecycle);

export const locationAccessGrantSchema = new Schema<GrantDocument>(
  {
    schemaVersion,
    tenantId,
    targetMembershipId: immutableObjectId,
    locationId: immutableObjectId,
    grantedByUserId: immutableObjectId,
    status: { type: String, required: true, enum: ["active", "revoked"], default: "active" },
    revokedAt: { type: Date, default: null }
  },
  { ...options, collection: "location_access_grants" }
);
locationAccessGrantSchema.pre("validate", function (this: HydratedDocument<GrantDocument>) {
  if ((this.status === "revoked") !== (this.revokedAt !== null)) {
    throw new Error("Revoked location grants require revokedAt");
  }
});

export const staffLocationAssignmentSchema = new Schema<AssignmentDocument>(
  {
    schemaVersion,
    tenantId,
    staffProfileId: immutableObjectId,
    locationId: immutableObjectId,
    status,
    archivedAt
  },
  { ...options, collection: "staff_location_assignments" }
);
staffLocationAssignmentSchema.pre("validate", archiveLifecycle);

export const staffServiceEligibilitySchema = new Schema<EligibilityDocument>(
  {
    schemaVersion,
    tenantId,
    staffProfileId: immutableObjectId,
    serviceId: immutableObjectId,
    status,
    archivedAt
  },
  { ...options, collection: "staff_service_eligibility" }
);
staffServiceEligibilitySchema.pre("validate", archiveLifecycle);

export const serviceLocationOfferingSchema = new Schema<ServiceLocationOfferingDocument>(
  {
    schemaVersion,
    tenantId,
    serviceId: immutableObjectId,
    locationId: immutableObjectId,
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 1_440,
      validate: safeIntegerValidator
    },
    bufferBeforeMinutes: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 240,
      validate: safeIntegerValidator
    },
    bufferAfterMinutes: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 240,
      validate: safeIntegerValidator
    },
    quotedPriceMinor: {
      type: Number,
      required: true,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      validate: safeIntegerValidator
    },
    slotIncrementMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 240,
      validate: [
        safeIntegerValidator,
        { validator: (value: number) => 1_440 % value === 0, message: "must divide a 24-hour day" }
      ]
    },
    minAdvanceMinutes: {
      type: Number,
      required: true,
      min: 0,
      max: 525_600,
      validate: safeIntegerValidator
    },
    maxAdvanceDays: {
      type: Number,
      required: true,
      min: 0,
      max: 730,
      validate: safeIntegerValidator
    },
    status,
    archivedAt
  },
  { ...options, collection: "service_location_offerings" }
);
serviceLocationOfferingSchema.pre("validate", archiveLifecycle);

export const weeklyScheduleVersionSchema = new Schema<WeeklyScheduleVersionDocument>(
  {
    schemaVersion,
    tenantId,
    ownerType: { type: String, required: true, immutable: true, enum: ["location", "staff"] },
    ownerId: immutableObjectId,
    timezone: { type: String, required: true, immutable: true, validate: timezoneValidator },
    effectiveFrom: { type: String, required: true, immutable: true, validate: localDateValidator },
    effectiveTo: { type: String, default: null, validate: localDateValidator },
    week: { type: [weekdaySchema], required: true, immutable: true },
    createdByUserId: immutableObjectId,
    archivedAt
  },
  { ...options, collection: "weekly_schedule_versions" }
);
weeklyScheduleVersionSchema.pre(
  "validate",
  function (this: HydratedDocument<WeeklyScheduleVersionDocument>) {
    weeklyScheduleSchema.parse(
      this.week.map((day) => ({
        weekday: day.weekday,
        intervals: day.intervals.map((interval) => ({
          startMinute: interval.startMinute,
          endMinute: interval.endMinute
        }))
      }))
    );
    if (this.effectiveTo !== null && this.effectiveTo < this.effectiveFrom) {
      throw new Error("effectiveTo cannot precede effectiveFrom");
    }
  }
);

export const calendarDateOverrideSchema = new Schema<CalendarDateOverrideDocument>(
  {
    schemaVersion,
    tenantId,
    ownerType: { type: String, required: true, immutable: true, enum: ["location", "staff"] },
    ownerId: immutableObjectId,
    timezone: { type: String, required: true, immutable: true, validate: timezoneValidator },
    localDate: { type: String, required: true, immutable: true, validate: localDateValidator },
    intervals: { type: [intervalSchema], required: true, immutable: true },
    createdByUserId: immutableObjectId,
    archivedAt
  },
  { ...options, collection: "calendar_date_overrides" }
);
calendarDateOverrideSchema.pre(
  "validate",
  function (this: HydratedDocument<CalendarDateOverrideDocument>) {
    scheduleIntervalsSchema.parse(
      this.intervals.map((interval) => ({
        startMinute: interval.startMinute,
        endMinute: interval.endMinute
      }))
    );
  }
);

export const staffUnavailabilitySchema = new Schema<StaffUnavailabilityDocument>(
  {
    schemaVersion,
    tenantId,
    staffProfileId: immutableObjectId,
    startsAt: { type: Date, required: true, immutable: true },
    endsAt: { type: Date, required: true, immutable: true },
    reasonCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 64
    },
    authorizedByUserId: immutableObjectId,
    archivedAt
  },
  { ...options, collection: "staff_unavailability" }
);
staffUnavailabilitySchema.pre(
  "validate",
  function (this: HydratedDocument<StaffUnavailabilityDocument>) {
    if (this.startsAt >= this.endsAt) throw new Error("Unavailability end must be after start");
  }
);

export const bookingSchema = new Schema<BookingDocument>(
  {
    schemaVersion,
    tenantId,
    locationId: immutableObjectId,
    localDate: { type: String, required: true, validate: localDateValidator },
    timezone: { type: String, required: true, validate: timezoneValidator },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "confirmed", "in_progress", "completed", "no_show", "cancelled"]
    },
    version: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: safeIntegerValidator
    },
    source: {
      type: String,
      required: true,
      enum: ["appointment", "walk_in"],
      immutable: true
    },
    guest: { type: guestSchema, required: true, immutable: true },
    lines: { type: [bookingLineSchema], required: true },
    deletedAt: { type: Date, default: null }
  },
  { ...options, collection: "bookings" }
);
bookingSchema.pre("validate", function (this: HydratedDocument<BookingDocument>) {
  if (this.startsAt >= this.endsAt) throw new Error("Booking end must be after start");
  if (this.source !== "walk_in" && this.guest.kind === "anonymous") {
    throw new Error("Only immediate walk-ins may use an anonymous guest snapshot");
  }
  guestSnapshotSchema.parse({
    kind: this.guest.kind,
    displayName: this.guest.displayName,
    ...(this.guest.phone === undefined ? {} : { phone: this.guest.phone }),
    ...(this.guest.email === undefined ? {} : { email: this.guest.email }),
    customerId: this.guest.customerId?.toHexString() ?? null
  });
  if (this.lines.length === 0) throw new Error("Bookings require at least one service line");
  const lines = this.lines.map((line) => ({
    order: line.order,
    serviceId: line.serviceId.toHexString(),
    serviceName: line.serviceName,
    assignedStaffProfileId: line.assignedStaffProfileId.toHexString(),
    durationMinutes: line.durationMinutes,
    bufferBeforeMinutes: line.bufferBeforeMinutes,
    bufferAfterMinutes: line.bufferAfterMinutes,
    quotedPriceMinor: line.quotedPriceMinor,
    startsAt: line.startsAt,
    endsAt: line.endsAt,
    status: line.status,
    skippedReasonCode: line.skippedReasonCode
  }));
  lines.forEach((line) => bookingLineSnapshotSchema.parse(line));
  const firstTreatmentStartsAt = lines[0]!.startsAt;
  if (this.localDate !== localDateInTimezone(firstTreatmentStartsAt, this.timezone)) {
    throw new Error(
      "Booking localDate must derive from the first treatment line start in the booking timezone"
    );
  }
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]!.order !== index) throw new Error("Booking line order must be contiguous");
    const line = lines[index]!;
    if (line.endsAt.getTime() - line.startsAt.getTime() !== line.durationMinutes * 60_000) {
      throw new Error("Booking line time range must exactly match durationMinutes");
    }
    if ((line.status === "skipped") !== (line.skippedReasonCode !== null)) {
      throw new Error("Only skipped lines require a skippedReasonCode");
    }
    if (index > 0) {
      const previous = lines[index - 1]!;
      const previousBufferedEnd = previous.endsAt.getTime() + previous.bufferAfterMinutes * 60_000;
      const currentBufferedStart = line.startsAt.getTime() - line.bufferBeforeMinutes * 60_000;
      if (currentBufferedStart < previousBufferedEnd) {
        throw new Error("Booking line buffered occupancy must not overlap; gaps are allowed");
      }
    }
  }
  const first = lines[0]!;
  const last = lines.at(-1)!;
  if (
    this.startsAt.getTime() !== first.startsAt.getTime() - first.bufferBeforeMinutes * 60_000 ||
    this.endsAt.getTime() !== last.endsAt.getTime() + last.bufferAfterMinutes * 60_000
  ) {
    throw new Error("Booking range must exactly cover buffered line occupancy");
  }
  assertBookingLineStatusInvariant(
    this.status,
    lines.map(({ status }) => status)
  );
});
bookingSchema.pre("save", function (this: HydratedDocument<BookingDocument>) {
  if (!this.isNew) {
    throw new Error(
      "Existing booking document saves are forbidden; use an invariant-preserving command"
    );
  }
});
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate"] as const) {
  bookingSchema.pre(operation, function () {
    throw new Error("Generic booking updates are forbidden; use an invariant-preserving command");
  });
}
for (const operation of ["replaceOne", "findOneAndReplace"] as const) {
  bookingSchema.pre(operation, function () {
    throw new Error("Booking replacement is forbidden; use an invariant-preserving command");
  });
}
for (const operation of ["deleteOne", "deleteMany", "findOneAndDelete"] as const) {
  bookingSchema.pre(operation, function () {
    throw new Error("Booking hard deletion is forbidden while retention is undefined");
  });
}
bookingSchema.pre("deleteOne", { document: true, query: false }, function () {
  throw new Error("Booking hard deletion is forbidden while retention is undefined");
});
bookingSchema.pre("bulkWrite", function () {
  throw new Error("Booking bulk mutation is forbidden; use an invariant-preserving command");
});

export const bookingEventSchema = new Schema<BookingEventDocument>(
  {
    schemaVersion,
    tenantId,
    bookingId: immutableObjectId,
    sequence: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
      validate: safeIntegerValidator
    },
    eventType: { type: String, required: true, immutable: true, enum: BOOKING_EVENT_TYPES },
    actorUserId: immutableObjectId,
    occurredAt: { type: Date, required: true, immutable: true },
    reasonCode: { type: String, default: null, immutable: true, maxlength: 64 },
    note: { type: String, default: null, immutable: true, maxlength: 500 },
    fromStatus: { type: String, default: null, immutable: true, enum: [...BOOKING_STATUSES, null] },
    toStatus: { type: String, default: null, immutable: true, enum: [...BOOKING_STATUSES, null] },
    lineOrder: {
      type: Number,
      default: null,
      immutable: true,
      min: 0,
      max: 99,
      validate: {
        validator: (value: number | null) => value === null || Number.isSafeInteger(value),
        message: "must be a safe integer"
      }
    },
    bookingVersion: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
      validate: safeIntegerValidator
    }
  },
  { ...options, collection: "booking_events" }
);
bookingEventSchema.pre("validate", function (this: HydratedDocument<BookingEventDocument>) {
  assertBookingEvent(this);
});
bookingEventSchema.pre("save", function (this: HydratedDocument<BookingEventDocument>) {
  if (!this.isNew) throw new Error("Booking events are immutable");
});
for (const operation of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete"
] as const) {
  bookingEventSchema.pre(operation, function () {
    throw new Error("Booking events are immutable");
  });
}
bookingEventSchema.pre("bulkWrite", function () {
  throw new Error("Booking events are immutable");
});
bookingEventSchema.pre("deleteOne", { document: true, query: false }, function () {
  throw new Error("Booking events are immutable");
});

export const scheduleGuardSchema = new Schema<ScheduleGuardDocument>(
  {
    schemaVersion,
    tenantId,
    scopeType: { type: String, required: true, immutable: true, enum: ["location", "staff"] },
    scopeId: immutableObjectId,
    version: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: safeIntegerValidator
    }
  },
  { ...options, collection: "schedule_guards" }
);

export const staffDayLockSchema = new Schema<StaffDayLockDocument>(
  {
    schemaVersion,
    tenantId,
    staffProfileId: immutableObjectId,
    utcDate: { type: String, required: true, immutable: true, validate: localDateValidator },
    version: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: safeIntegerValidator
    }
  },
  { ...options, collection: "staff_day_locks" }
);

export const mutationReceiptSchema = new Schema<MutationReceiptDocument>(
  {
    schemaVersion,
    tenantId,
    actorUserId: immutableObjectId,
    operation: { type: String, required: true, immutable: true, minlength: 1, maxlength: 64 },
    idempotencyKey: {
      type: String,
      required: true,
      immutable: true,
      minlength: 16,
      maxlength: 128
    },
    requestHash: { type: String, required: true, immutable: true, match: /^[0-9a-f]{64}$/ },
    status: {
      type: String,
      required: true,
      enum: ["processing", "succeeded", "conflict", "failed"]
    },
    entityType: { type: String, default: null, maxlength: 64 },
    entityId: { type: Schema.Types.ObjectId, default: null },
    expectedVersion: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: (value: number | null) => value === null || Number.isSafeInteger(value),
        message: "must be a safe integer"
      }
    },
    completedAt: { type: Date, default: null }
  },
  { ...options, collection: "mutation_receipts" }
);
mutationReceiptSchema.pre("validate", function (this: HydratedDocument<MutationReceiptDocument>) {
  const terminal = this.status !== "processing";
  if (terminal !== (this.completedAt !== null)) {
    throw new Error("Terminal mutation receipts require completedAt");
  }
  if ((this.entityType === null) !== (this.entityId === null)) {
    throw new Error("Mutation receipt entityType and entityId must be set together");
  }
});

function localDateInTimezone(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(instant);
  const part = (type: "year" | "month" | "day") =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("Unable to derive booking localDate");
  }
  return `${year}-${month}-${day}`;
}

function assertBookingLineStatusInvariant(
  bookingStatus: BookingDocument["status"],
  lineStatuses: readonly BookingLineDocument["status"][]
): void {
  if (["pending", "confirmed", "no_show", "cancelled"].includes(bookingStatus)) {
    if (!lineStatuses.every((status) => status === "scheduled")) {
      throw new Error(`${bookingStatus} bookings require every line to remain scheduled`);
    }
    return;
  }
  if (bookingStatus === "completed") {
    if (!lineStatuses.every((status) => status === "completed" || status === "skipped")) {
      throw new Error("Completed bookings require every line to be completed or skipped");
    }
    return;
  }

  let phase: "performed" | "active" | "scheduled" = "performed";
  let progressed = false;
  for (const status of lineStatuses) {
    if (status === "completed" || status === "skipped") {
      if (phase !== "performed") throw new Error("In-progress line states must remain ordered");
      progressed = true;
    } else if (status === "in_progress") {
      if (phase !== "performed") throw new Error("Only one ordered line may be in progress");
      phase = "active";
      progressed = true;
    } else {
      phase = "scheduled";
    }
  }
  if (!progressed) throw new Error("In-progress bookings require at least one progressed line");
}

function assertBookingEvent(event: BookingEventDocument): void {
  bookingEventTypeSchema.parse(event.eventType);
  const reasonRequired = ["rescheduled", "line_skipped", "no_show", "cancelled"].includes(
    event.eventType
  );
  if (reasonRequired !== (event.reasonCode !== null)) {
    throw new Error("Booking event reasonCode does not match its event type");
  }
  if (!reasonRequired && event.note !== null) {
    throw new Error("Booking event notes require a reason-bearing event type");
  }
  const lineEvent = ["line_started", "line_completed", "line_skipped"].includes(event.eventType);
  if (lineEvent !== (event.lineOrder !== null)) {
    throw new Error("Line events require lineOrder and aggregate events forbid it");
  }

  const validTransition =
    (event.eventType === "created" &&
      event.fromStatus === null &&
      (event.toStatus === "pending" || event.toStatus === "confirmed")) ||
    (event.eventType === "confirmed" &&
      event.fromStatus === "pending" &&
      event.toStatus === "confirmed") ||
    (event.eventType === "rescheduled" &&
      (event.fromStatus === "pending" || event.fromStatus === "confirmed") &&
      event.toStatus === event.fromStatus) ||
    (event.eventType === "started" &&
      event.fromStatus === "confirmed" &&
      event.toStatus === "in_progress") ||
    (event.eventType === "completed" &&
      event.fromStatus === "in_progress" &&
      event.toStatus === "completed") ||
    (event.eventType === "no_show" &&
      event.fromStatus === "confirmed" &&
      event.toStatus === "no_show") ||
    (event.eventType === "cancelled" &&
      (event.fromStatus === "pending" || event.fromStatus === "confirmed") &&
      event.toStatus === "cancelled") ||
    (lineEvent && event.fromStatus === null && event.toStatus === null);
  if (!validTransition) throw new Error("Booking event status transition is invalid");
}

function archiveLifecycle(this: HydratedDocument<{ status: string; archivedAt: Date | null }>) {
  if ((this.status === "archived") !== (this.archivedAt !== null)) {
    throw new Error("Archived records require archivedAt");
  }
}

export const ServiceModel =
  (mongoose.models.Service as Model<ServiceDocument> | undefined) ??
  mongoose.model<ServiceDocument>("Service", serviceSchema);
export const StaffBookingProfileModel =
  (mongoose.models.StaffBookingProfile as Model<StaffBookingProfileDocument> | undefined) ??
  mongoose.model<StaffBookingProfileDocument>("StaffBookingProfile", staffBookingProfileSchema);
export const LocationAccessGrantModel =
  (mongoose.models.LocationAccessGrant as Model<GrantDocument> | undefined) ??
  mongoose.model<GrantDocument>("LocationAccessGrant", locationAccessGrantSchema);
export const StaffLocationAssignmentModel =
  (mongoose.models.StaffLocationAssignment as Model<AssignmentDocument> | undefined) ??
  mongoose.model<AssignmentDocument>("StaffLocationAssignment", staffLocationAssignmentSchema);
export const StaffServiceEligibilityModel =
  (mongoose.models.StaffServiceEligibility as Model<EligibilityDocument> | undefined) ??
  mongoose.model<EligibilityDocument>("StaffServiceEligibility", staffServiceEligibilitySchema);
export const ServiceLocationOfferingModel =
  (mongoose.models.ServiceLocationOffering as Model<ServiceLocationOfferingDocument> | undefined) ??
  mongoose.model<ServiceLocationOfferingDocument>(
    "ServiceLocationOffering",
    serviceLocationOfferingSchema
  );
export const WeeklyScheduleVersionModel =
  (mongoose.models.WeeklyScheduleVersion as Model<WeeklyScheduleVersionDocument> | undefined) ??
  mongoose.model<WeeklyScheduleVersionDocument>(
    "WeeklyScheduleVersion",
    weeklyScheduleVersionSchema
  );
export const CalendarDateOverrideModel =
  (mongoose.models.CalendarDateOverride as Model<CalendarDateOverrideDocument> | undefined) ??
  mongoose.model<CalendarDateOverrideDocument>("CalendarDateOverride", calendarDateOverrideSchema);
export const StaffUnavailabilityModel =
  (mongoose.models.StaffUnavailability as Model<StaffUnavailabilityDocument> | undefined) ??
  mongoose.model<StaffUnavailabilityDocument>("StaffUnavailability", staffUnavailabilitySchema);
export const BookingModel =
  (mongoose.models.Booking as Model<BookingDocument> | undefined) ??
  mongoose.model<BookingDocument>("Booking", bookingSchema);
BookingModel.bulkSave = () =>
  Promise.reject(new Error("Booking bulkSave is forbidden; use an invariant-preserving command"));
export const BookingEventModel =
  (mongoose.models.BookingEvent as Model<BookingEventDocument> | undefined) ??
  mongoose.model<BookingEventDocument>("BookingEvent", bookingEventSchema);
export const ScheduleGuardModel =
  (mongoose.models.ScheduleGuard as Model<ScheduleGuardDocument> | undefined) ??
  mongoose.model<ScheduleGuardDocument>("ScheduleGuard", scheduleGuardSchema);
export const StaffDayLockModel =
  (mongoose.models.StaffDayLock as Model<StaffDayLockDocument> | undefined) ??
  mongoose.model<StaffDayLockDocument>("StaffDayLock", staffDayLockSchema);
export const MutationReceiptModel =
  (mongoose.models.MutationReceipt as Model<MutationReceiptDocument> | undefined) ??
  mongoose.model<MutationReceiptDocument>("MutationReceipt", mutationReceiptSchema);
