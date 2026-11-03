import { createHash } from "node:crypto";

import {
  availabilityQuerySchema,
  availabilityResultSchema,
  bookingCommandResultSchema,
  confirmBookingCommandSchema,
  createBookingCommandSchema,
  objectIdSchema,
  rescheduleBookingCommandSchema,
  type AvailabilityQuery,
  type AvailabilityResult,
  type AvailabilitySlot,
  type BookingCommandResult,
  type BookingSelection,
  type ConfirmBookingCommand,
  type CreateBookingCommand,
  type RescheduleBookingCommand
} from "@zuridesk/shared";
import type { ClientSession, HydratedDocument, Types } from "mongoose";
import { Types as MongooseTypes } from "mongoose";

import { getInternalDatabaseConnection } from "../connection";
import { assertTrustedTenantContext, type TrustedTenantContext } from "../context/tenant-context";
import { LocationAccessGrantModel } from "../models/phase4-models";
import { LocationModel, MembershipModel, TenantModel } from "../models/identity-models";
import {
  BookingEventModel,
  BookingModel,
  CalendarDateOverrideModel,
  MutationReceiptModel,
  ScheduleGuardModel,
  ServiceLocationOfferingModel,
  ServiceModel,
  StaffBookingProfileModel,
  StaffDayLockModel,
  StaffLocationAssignmentModel,
  StaffServiceEligibilityModel,
  StaffUnavailabilityModel,
  WeeklyScheduleVersionModel,
  type BookingDocument,
  type ServiceLocationOfferingDocument
} from "../models/phase4-models";
import { toObjectId } from "../repositories/repository-helpers";
import { DatabaseCommandError, isDuplicateKey, isWriteConflict } from "./errors";
import {
  ceilToLocalGrid,
  intersectRanges,
  localDateAt,
  localMinuteToInstant,
  minuteRangesToUtc,
  rangeIsContained,
  rangesIntersect,
  subtractRanges,
  utcDatesCrossed,
  weekdayForLocalDate,
  type MinuteRange,
  type TimeRange
} from "./phase4-availability";

const BLOCKING_STATUSES = ["confirmed", "in_progress"] as const;
const MAX_SEARCH_STEPS = 2_000;

interface InternalOptions {
  readonly clock?: () => Date;
  readonly afterPreview?: () => Promise<void>;
}

interface ResolvedLine {
  readonly serviceId: Types.ObjectId;
  readonly serviceName: string;
  readonly staffProfileId: Types.ObjectId;
  readonly offering: ServiceLocationOfferingDocument;
  readonly free: readonly TimeRange[];
}

interface EvaluationContext {
  readonly tenantId: Types.ObjectId;
  readonly locationId: Types.ObjectId;
  readonly localDate: string;
  readonly timezone: string;
  readonly locationRanges: readonly TimeRange[];
  readonly lines: readonly ResolvedLine[];
  readonly guardVersions: readonly GuardVersion[];
}

interface GuardVersion {
  readonly scopeType: "location" | "staff";
  readonly scopeId: Types.ObjectId;
  readonly version: number;
  readonly exists: boolean;
}

interface CandidateLine {
  readonly order: number;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly assignedStaffProfileId: string;
  readonly durationMinutes: number;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly quotedPriceMinor: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly bufferedStartsAt: Date;
  readonly bufferedEndsAt: Date;
}

interface Candidate {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly lines: readonly CandidateLine[];
}

interface MutationReplay {
  readonly replay: true;
  readonly bookingId: Types.ObjectId;
}

interface MutationClaim {
  readonly replay: false;
  readonly receiptId: Types.ObjectId;
}

type ReceiptClaim = MutationReplay | MutationClaim;
type BookingHydrated = HydratedDocument<BookingDocument>;

export async function queryBookingAvailability(
  context: TrustedTenantContext,
  input: AvailabilityQuery,
  options: InternalOptions = {}
): Promise<AvailabilityResult> {
  assertTrustedTenantContext(context);
  const parsed = availabilityQuerySchema.parse(input);
  const evaluatedAt = now(options);
  const tenantId = toObjectId(context.tenantId, "tenantId");
  await authorizeBookingOperation(
    tenantId,
    toObjectId(context.userId, "userId"),
    toObjectId(parsed.locationId, "locationId"),
    null
  );
  const result = await evaluateAvailability(tenantId, parsed, evaluatedAt, null);
  return availabilityResultSchema.parse(result);
}

export async function createBooking(
  context: TrustedTenantContext,
  input: CreateBookingCommand,
  options: InternalOptions = {}
): Promise<BookingCommandResult> {
  assertTrustedTenantContext(context);
  const parsed = createBookingCommandSchema.parse(input);
  const capturedNow = now(options);
  const tenantId = toObjectId(context.tenantId, "tenantId");
  const actorUserId = toObjectId(context.userId, "userId");
  const locationId = toObjectId(parsed.locationId, "locationId");
  await authorizeBookingOperation(tenantId, actorUserId, locationId, null);
  const requestHash = hashRequest("createBooking", parsed);
  const replay = await readCompletedReplay(
    tenantId,
    actorUserId,
    "createBooking",
    parsed.idempotencyKey,
    requestHash
  );
  if (replay !== null) return replay;

  const firstStart = parsed.source === "walk_in" ? capturedNow : parsed.startsAt!;
  const localDate = await locationLocalDate(tenantId, locationId, firstStart, null);
  const preview = await evaluateExact(
    tenantId,
    locationId,
    localDate,
    parsed.selections,
    firstStart,
    capturedNow,
    parsed.source === "walk_in",
    parsed.source === "appointment",
    null
  );
  if (preview === null) throw new DatabaseCommandError("CONFLICT");
  await options.afterPreview?.();
  const bookingId = new MongooseTypes.ObjectId();

  const outcome = await runTransaction(async (session) => {
    await authorizeBookingOperation(tenantId, actorUserId, locationId, session);
    const claim = await claimReceipt(
      tenantId,
      actorUserId,
      "createBooking",
      parsed.idempotencyKey,
      requestHash,
      null,
      capturedNow,
      session
    );
    if (claim.replay) return bookingResultFromId(tenantId, claim.bookingId, true, session);

    try {
      await acquireGuards(tenantId, preview.guards, capturedNow, session);
      await acquireServiceConfigurationLocks(tenantId, preview.candidate, "CONFLICT", session);
      if (parsed.status === "confirmed") {
        await acquireCandidateLocks(tenantId, preview.candidate, session);
      }
      const exact = await evaluateExact(
        tenantId,
        locationId,
        localDate,
        parsed.selections,
        firstStart,
        capturedNow,
        parsed.source === "walk_in",
        parsed.source === "appointment",
        session
      );
      if (exact === null) throw new DatabaseCommandError("CONFLICT");
      if (parsed.status === "confirmed") {
        assertCandidateLockIdentitiesMatch(preview.candidate, exact.candidate);
      }
      await persistCreatedBooking(
        tenantId,
        actorUserId,
        bookingId,
        parsed,
        exact.context.timezone,
        exact.candidate,
        capturedNow,
        session
      );
      await completeReceipt(tenantId, claim.receiptId, bookingId, capturedNow, session);
      return bookingResultFromId(tenantId, bookingId, false, session);
    } catch (error) {
      if (error instanceof DatabaseCommandError) {
        await conflictReceipt(tenantId, claim.receiptId, capturedNow, session);
        return error;
      }
      throw error;
    }
  });
  if (outcome instanceof DatabaseCommandError) throw outcome;
  return outcome;
}

export async function confirmBooking(
  context: TrustedTenantContext,
  input: ConfirmBookingCommand,
  options: InternalOptions = {}
): Promise<BookingCommandResult> {
  assertTrustedTenantContext(context);
  const parsed = confirmBookingCommandSchema.parse(input);
  const capturedNow = now(options);
  const tenantId = toObjectId(context.tenantId, "tenantId");
  const actorUserId = toObjectId(context.userId, "userId");
  const bookingId = toObjectId(parsed.bookingId, "bookingId");
  const previewBooking = await BookingModel.findOne({ _id: bookingId, tenantId, deletedAt: null });
  if (previewBooking === null) throw new DatabaseCommandError("NOT_FOUND");
  await authorizeBookingOperation(tenantId, actorUserId, previewBooking.locationId, null);
  const requestHash = hashRequest("confirmBooking", parsed);
  const replay = await readCompletedReplay(
    tenantId,
    actorUserId,
    "confirmBooking",
    parsed.idempotencyKey,
    requestHash
  );
  if (replay !== null) return replay;
  const preview = await previewStoredBooking(tenantId, previewBooking, capturedNow, null);

  const outcome = await runTransaction(async (session) => {
    const booking = await BookingModel.findOne({
      _id: bookingId,
      tenantId,
      deletedAt: null
    }).session(session);
    if (booking === null) throw new DatabaseCommandError("NOT_FOUND");
    await authorizeBookingOperation(tenantId, actorUserId, booking.locationId, session);
    const claim = await claimReceipt(
      tenantId,
      actorUserId,
      "confirmBooking",
      parsed.idempotencyKey,
      requestHash,
      parsed.expectedVersion,
      capturedNow,
      session
    );
    if (claim.replay) return bookingResultFromId(tenantId, claim.bookingId, true, session);
    try {
      if (booking.status !== "pending" || booking.version !== parsed.expectedVersion) {
        throw new DatabaseCommandError("CONFLICT");
      }
      await acquireGuards(tenantId, preview.guards, capturedNow, session);
      await acquireServiceConfigurationLocks(
        tenantId,
        preview.candidate,
        "CONFIGURATION_CHANGED",
        session
      );
      await acquireCandidateLocks(tenantId, preview.candidate, session);
      const exact = await previewStoredBooking(tenantId, booking, capturedNow, session);
      assertCandidateLockIdentitiesMatch(preview.candidate, exact.candidate);
      if (!commercialSnapshotMatches(booking, exact.candidate)) {
        throw new DatabaseCommandError("CONFIGURATION_CHANGED");
      }
      await persistBookingUpdate(
        booking,
        { status: "confirmed", version: booking.version + 1 },
        actorUserId,
        "confirmed",
        null,
        null,
        capturedNow,
        session
      );
      await completeReceipt(tenantId, claim.receiptId, bookingId, capturedNow, session);
      return bookingResultFromId(tenantId, bookingId, false, session);
    } catch (error) {
      if (error instanceof DatabaseCommandError) {
        await conflictReceipt(tenantId, claim.receiptId, capturedNow, session);
        return error;
      }
      throw error;
    }
  });
  if (outcome instanceof DatabaseCommandError) throw outcome;
  return outcome;
}

export async function rescheduleBooking(
  context: TrustedTenantContext,
  input: RescheduleBookingCommand,
  options: InternalOptions = {}
): Promise<BookingCommandResult> {
  assertTrustedTenantContext(context);
  const parsed = rescheduleBookingCommandSchema.parse(input);
  const capturedNow = now(options);
  const tenantId = toObjectId(context.tenantId, "tenantId");
  const actorUserId = toObjectId(context.userId, "userId");
  const bookingId = toObjectId(parsed.bookingId, "bookingId");
  const previewBooking = await BookingModel.findOne({ _id: bookingId, tenantId, deletedAt: null });
  if (previewBooking === null) throw new DatabaseCommandError("NOT_FOUND");
  await authorizeBookingOperation(tenantId, actorUserId, previewBooking.locationId, null);
  const requestHash = hashRequest("rescheduleBooking", parsed);
  const replay = await readCompletedReplay(
    tenantId,
    actorUserId,
    "rescheduleBooking",
    parsed.idempotencyKey,
    requestHash
  );
  if (replay !== null) return replay;
  assertSameServices(previewBooking, parsed.selections);
  const localDate = await locationLocalDate(
    tenantId,
    previewBooking.locationId,
    parsed.startsAt,
    null
  );
  const preview = await evaluateExistingAt(
    tenantId,
    previewBooking,
    localDate,
    parsed.selections,
    parsed.startsAt,
    capturedNow,
    true,
    null
  );
  if (!commercialSnapshotMatches(previewBooking, preview.candidate)) {
    throw new DatabaseCommandError("CONFIGURATION_CHANGED");
  }
  const outcome = await runTransaction(async (session) => {
    const booking = await BookingModel.findOne({
      _id: bookingId,
      tenantId,
      deletedAt: null
    }).session(session);
    if (booking === null) throw new DatabaseCommandError("NOT_FOUND");
    await authorizeBookingOperation(tenantId, actorUserId, booking.locationId, session);
    const claim = await claimReceipt(
      tenantId,
      actorUserId,
      "rescheduleBooking",
      parsed.idempotencyKey,
      requestHash,
      parsed.expectedVersion,
      capturedNow,
      session
    );
    if (claim.replay) return bookingResultFromId(tenantId, claim.bookingId, true, session);
    try {
      if (
        (booking.status !== "pending" && booking.status !== "confirmed") ||
        booking.version !== parsed.expectedVersion
      ) {
        throw new DatabaseCommandError("CONFLICT");
      }
      assertSameServices(booking, parsed.selections);
      await acquireGuards(tenantId, preview.guards, capturedNow, session);
      await acquireServiceConfigurationLocks(
        tenantId,
        preview.candidate,
        "CONFIGURATION_CHANGED",
        session
      );
      if (booking.status === "confirmed") {
        await acquireCandidateLocks(
          tenantId,
          unionOldAndNewCandidate(booking, preview.candidate),
          session
        );
      }
      const exact = await evaluateExistingAt(
        tenantId,
        booking,
        localDate,
        parsed.selections,
        parsed.startsAt,
        capturedNow,
        true,
        session
      );
      if (booking.status === "confirmed") {
        assertCandidateLockIdentitiesMatch(
          unionOldAndNewCandidate(booking, preview.candidate),
          unionOldAndNewCandidate(booking, exact.candidate)
        );
      }
      if (!commercialSnapshotMatches(booking, exact.candidate)) {
        throw new DatabaseCommandError("CONFIGURATION_CHANGED");
      }
      const updatedLines = booking.lines.map((line, index) => ({
        order: line.order,
        serviceId: line.serviceId,
        serviceName: line.serviceName,
        assignedStaffProfileId: toObjectId(
          exact.candidate.lines[index]!.assignedStaffProfileId,
          "assignedStaffProfileId"
        ),
        durationMinutes: line.durationMinutes,
        bufferBeforeMinutes: line.bufferBeforeMinutes,
        bufferAfterMinutes: line.bufferAfterMinutes,
        quotedPriceMinor: line.quotedPriceMinor,
        startsAt: exact.candidate.lines[index]!.startsAt,
        endsAt: exact.candidate.lines[index]!.endsAt,
        status: line.status,
        skippedReasonCode: line.skippedReasonCode
      }));
      await persistBookingUpdate(
        booking,
        {
          localDate,
          timezone: exact.context.timezone,
          startsAt: exact.candidate.startsAt,
          endsAt: exact.candidate.endsAt,
          lines: updatedLines,
          version: booking.version + 1
        },
        actorUserId,
        "rescheduled",
        parsed.reasonCode,
        parsed.note ?? null,
        capturedNow,
        session
      );
      await completeReceipt(tenantId, claim.receiptId, bookingId, capturedNow, session);
      return bookingResultFromId(tenantId, bookingId, false, session);
    } catch (error) {
      if (error instanceof DatabaseCommandError) {
        await conflictReceipt(tenantId, claim.receiptId, capturedNow, session);
        return error;
      }
      throw error;
    }
  });
  if (outcome instanceof DatabaseCommandError) throw outcome;
  return outcome;
}

async function evaluateAvailability(
  tenantId: Types.ObjectId,
  input: AvailabilityQuery,
  evaluatedAt: Date,
  session: ClientSession | null
): Promise<AvailabilityResult> {
  const locationId = toObjectId(input.locationId, "locationId");
  let context: EvaluationContext;
  try {
    context = await resolveEvaluationContext(
      tenantId,
      locationId,
      input.localDate,
      input.selections,
      session
    );
  } catch (error) {
    if (!(error instanceof AvailabilityConfigurationError)) throw error;
    return availabilityResultSchema.parse({
      locationId: input.locationId,
      localDate: input.localDate,
      timezone: error.timezone,
      evaluatedAt,
      guardVersions: [],
      slots: [],
      reasons: [error.reason]
    });
  }
  const slots: AvailabilitySlot[] = [];
  const first = context.lines[0]!;
  const limit = input.limit ?? 200;
  for (
    let minute = 0;
    minute < 1_440 && slots.length < limit;
    minute += first.offering.slotIncrementMinutes
  ) {
    const startsAt = localMinuteToInstant(input.localDate, minute, context.timezone);
    if (startsAt === null) continue;
    const candidate = buildCandidate(context, startsAt, evaluatedAt, false, true);
    if (candidate !== null) slots.push(toAvailabilitySlot(candidate));
  }
  return availabilityResultSchema.parse({
    locationId: input.locationId,
    localDate: input.localDate,
    timezone: context.timezone,
    evaluatedAt,
    guardVersions: context.guardVersions.map((guard) => ({
      scopeType: guard.scopeType,
      scopeId: guard.scopeId.toHexString(),
      version: guard.version
    })),
    slots,
    reasons: slots.length === 0 ? ["NO_CAPACITY"] : []
  });
}

async function evaluateExact(
  tenantId: Types.ObjectId,
  locationId: Types.ObjectId,
  localDate: string,
  selections: readonly BookingSelection[],
  startsAt: Date,
  evaluatedAt: Date,
  bypassAdvance: boolean,
  requireFirstGrid: boolean,
  session: ClientSession | null,
  excludeBookingId?: Types.ObjectId
): Promise<{
  readonly context: EvaluationContext;
  readonly candidate: Candidate;
  readonly guards: readonly GuardVersion[];
} | null> {
  try {
    const context = await resolveEvaluationContext(
      tenantId,
      locationId,
      localDate,
      selections,
      session,
      excludeBookingId
    );
    const candidate = buildCandidate(
      context,
      startsAt,
      evaluatedAt,
      bypassAdvance,
      requireFirstGrid
    );
    return candidate === null ? null : { context, candidate, guards: context.guardVersions };
  } catch (error) {
    if (error instanceof AvailabilityConfigurationError) return null;
    throw error;
  }
}

async function resolveEvaluationContext(
  tenantId: Types.ObjectId,
  locationId: Types.ObjectId,
  localDate: string,
  selections: readonly BookingSelection[],
  session: ClientSession | null,
  excludeBookingId?: Types.ObjectId
): Promise<EvaluationContext> {
  const location = await LocationModel.findOne({
    _id: locationId,
    tenantId,
    status: "active",
    deletedAt: null
  }).session(session);
  if (location === null) {
    throw new AvailabilityConfigurationError("LOCATION_UNAVAILABLE", "UTC");
  }
  const timezone = location.timezone;
  const locationRanges = await effectiveRanges(
    tenantId,
    "location",
    locationId,
    localDate,
    timezone,
    session
  );
  if (locationRanges.length === 0) {
    throw new AvailabilityConfigurationError("LOCATION_UNAVAILABLE", timezone);
  }

  const serviceIds = selections.map(({ serviceId }) => toObjectId(serviceId, "serviceId"));
  const staffIds = selections.map(({ assignedStaffProfileId }) =>
    toObjectId(assignedStaffProfileId, "assignedStaffProfileId")
  );
  const [services, offerings, profiles, assignments, eligibilities] = await Promise.all([
    ServiceModel.find({ _id: { $in: serviceIds }, tenantId, status: "active" }).session(session),
    ServiceLocationOfferingModel.find({
      tenantId,
      locationId,
      serviceId: { $in: serviceIds },
      status: "active"
    }).session(session),
    StaffBookingProfileModel.find({ _id: { $in: staffIds }, tenantId, status: "active" }).session(
      session
    ),
    StaffLocationAssignmentModel.find({
      tenantId,
      staffProfileId: { $in: staffIds },
      locationId,
      status: "active"
    }).session(session),
    StaffServiceEligibilityModel.find({
      tenantId,
      staffProfileId: { $in: staffIds },
      serviceId: { $in: serviceIds },
      status: "active"
    }).session(session)
  ]);
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const offeringByService = new Map(
    offerings.map((offering) => [offering.serviceId.toHexString(), offering])
  );
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const assignmentKeys = new Set(
    assignments.map(
      (assignment) =>
        `${assignment.staffProfileId.toHexString()}:${assignment.locationId.toHexString()}`
    )
  );
  const eligibilityKeys = new Set(
    eligibilities.map(
      (eligibility) =>
        `${eligibility.staffProfileId.toHexString()}:${eligibility.serviceId.toHexString()}`
    )
  );
  const memberships = await MembershipModel.find({
    _id: { $in: profiles.map((profile) => profile.membershipId) },
    tenantId,
    status: "active",
    deletedAt: null
  })
    .select({ _id: 1 })
    .session(session);
  const liveMemberships = new Set(memberships.map((membership) => membership.id));

  const bounds = {
    startsAt: locationRanges[0]!.startsAt,
    endsAt: locationRanges.at(-1)!.endsAt
  };
  const occupancyByStaff = await blockingOccupancy(
    tenantId,
    [...new Set(staffIds.map((id) => id.toHexString()))].map((id) => toObjectId(id)),
    bounds,
    session,
    excludeBookingId
  );
  const unavailability = await StaffUnavailabilityModel.find({
    tenantId,
    staffProfileId: { $in: staffIds },
    archivedAt: null,
    startsAt: { $lt: bounds.endsAt },
    endsAt: { $gt: bounds.startsAt }
  }).session(session);
  const unavailableByStaff = new Map<string, TimeRange[]>();
  for (const row of unavailability) {
    const key = row.staffProfileId.toHexString();
    const ranges = unavailableByStaff.get(key) ?? [];
    ranges.push({ startsAt: row.startsAt, endsAt: row.endsAt });
    unavailableByStaff.set(key, ranges);
  }

  const resolved: ResolvedLine[] = [];
  for (let index = 0; index < selections.length; index += 1) {
    const serviceId = serviceIds[index]!;
    const staffId = staffIds[index]!;
    const service = serviceById.get(serviceId.toHexString());
    const offering = offeringByService.get(serviceId.toHexString());
    const profile = profileById.get(staffId.toHexString());
    if (service === undefined || offering === undefined) {
      throw new AvailabilityConfigurationError("SERVICE_UNAVAILABLE", timezone);
    }
    if (
      profile === undefined ||
      !liveMemberships.has(profile.membershipId.toHexString()) ||
      !assignmentKeys.has(`${staffId.toHexString()}:${locationId.toHexString()}`) ||
      !eligibilityKeys.has(`${staffId.toHexString()}:${serviceId.toHexString()}`)
    ) {
      throw new AvailabilityConfigurationError("STAFF_UNAVAILABLE", timezone);
    }
    if (profile.scheduleMode === "unconfigured") {
      throw new AvailabilityConfigurationError("SCHEDULE_UNCONFIGURED", timezone);
    }
    const staffSchedule =
      profile.scheduleMode === "inherit_location"
        ? locationRanges
        : intersectRanges(
            locationRanges,
            await effectiveRanges(tenantId, "staff", staffId, localDate, timezone, session)
          );
    const blockers = [
      ...(occupancyByStaff.get(staffId.toHexString()) ?? []),
      ...(unavailableByStaff.get(staffId.toHexString()) ?? [])
    ];
    resolved.push({
      serviceId,
      serviceName: service.name,
      staffProfileId: staffId,
      offering,
      free: subtractRanges(staffSchedule, blockers)
    });
  }

  const uniqueStaffIds = [...new Set(staffIds.map((id) => id.toHexString()))].map((id) =>
    toObjectId(id)
  );
  const guards = await readGuardVersions(tenantId, locationId, uniqueStaffIds, session);
  return {
    tenantId,
    locationId,
    localDate,
    timezone,
    locationRanges,
    lines: resolved,
    guardVersions: guards
  };
}

async function effectiveRanges(
  tenantId: Types.ObjectId,
  ownerType: "location" | "staff",
  ownerId: Types.ObjectId,
  localDate: string,
  timezone: string,
  session: ClientSession | null
): Promise<readonly TimeRange[]> {
  const schedules = await WeeklyScheduleVersionModel.find({
    tenantId,
    ownerType,
    ownerId,
    archivedAt: null,
    effectiveFrom: { $lte: localDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: localDate } }]
  })
    .sort({ effectiveFrom: -1 })
    .limit(2)
    .session(session);
  if (schedules.length !== 1 || schedules[0]!.timezone !== timezone) {
    throw new AvailabilityConfigurationError("SCHEDULE_UNCONFIGURED", timezone);
  }
  const overrides = await CalendarDateOverrideModel.find({
    tenantId,
    ownerType,
    ownerId,
    localDate,
    archivedAt: null
  })
    .limit(2)
    .session(session);
  if (overrides.length > 1 || (overrides[0] !== undefined && overrides[0].timezone !== timezone)) {
    throw new AvailabilityConfigurationError("SCHEDULE_UNCONFIGURED", timezone);
  }
  const intervals: readonly MinuteRange[] =
    overrides[0]?.intervals ??
    schedules[0]!.week.find((day) => day.weekday === weekdayForLocalDate(localDate))?.intervals ??
    [];
  return minuteRangesToUtc(localDate, timezone, intervals);
}

async function blockingOccupancy(
  tenantId: Types.ObjectId,
  staffIds: readonly Types.ObjectId[],
  bounds: TimeRange,
  session: ClientSession | null,
  excludeBookingId?: Types.ObjectId
): Promise<Map<string, TimeRange[]>> {
  const bookings = await BookingModel.find({
    tenantId,
    ...(excludeBookingId === undefined ? {} : { _id: { $ne: excludeBookingId } }),
    status: { $in: BLOCKING_STATUSES },
    deletedAt: null,
    "lines.assignedStaffProfileId": { $in: staffIds },
    startsAt: { $lt: bounds.endsAt },
    endsAt: { $gt: bounds.startsAt }
  })
    .select({ lines: 1 })
    .session(session);
  const wanted = new Set(staffIds.map((id) => id.toHexString()));
  const result = new Map<string, TimeRange[]>();
  for (const booking of bookings) {
    for (const line of booking.lines) {
      const key = line.assignedStaffProfileId.toHexString();
      if (!wanted.has(key)) continue;
      const range = {
        startsAt: new Date(line.startsAt.getTime() - line.bufferBeforeMinutes * 60_000),
        endsAt: new Date(line.endsAt.getTime() + line.bufferAfterMinutes * 60_000)
      };
      if (!rangesIntersect(range, bounds)) continue;
      const ranges = result.get(key) ?? [];
      ranges.push(range);
      result.set(key, ranges);
    }
  }
  return result;
}

function buildCandidate(
  context: EvaluationContext,
  firstStartsAt: Date,
  evaluatedAt: Date,
  bypassAdvance: boolean,
  requireFirstGrid: boolean
): Candidate | null {
  const candidateLines: CandidateLine[] = [];
  let minimumStart = firstStartsAt;
  for (let index = 0; index < context.lines.length; index += 1) {
    const resolved = context.lines[index]!;
    let treatmentStart =
      index === 0
        ? firstStartsAt
        : ceilToLocalGrid(minimumStart, context.timezone, resolved.offering.slotIncrementMinutes);
    if (
      index === 0 &&
      requireFirstGrid &&
      ceilToLocalGrid(
        firstStartsAt,
        context.timezone,
        resolved.offering.slotIncrementMinutes
      ).getTime() !== firstStartsAt.getTime()
    ) {
      return null;
    }
    let line: CandidateLine | null = null;
    for (let step = 0; step < MAX_SEARCH_STEPS; step += 1) {
      const endsAt = new Date(
        treatmentStart.getTime() + resolved.offering.durationMinutes * 60_000
      );
      const bufferedStartsAt = new Date(
        treatmentStart.getTime() - resolved.offering.bufferBeforeMinutes * 60_000
      );
      const bufferedEndsAt = new Date(
        endsAt.getTime() + resolved.offering.bufferAfterMinutes * 60_000
      );
      const buffered = { startsAt: bufferedStartsAt, endsAt: bufferedEndsAt };
      if (
        localDateAt(firstStartsAt, context.timezone) !== context.localDate ||
        (!bypassAdvance && !insideAdvanceWindow(treatmentStart, evaluatedAt, resolved.offering))
      ) {
        return null;
      }
      if (rangeIsContained(buffered, resolved.free)) {
        line = {
          order: index,
          serviceId: resolved.serviceId.toHexString(),
          serviceName: resolved.serviceName,
          assignedStaffProfileId: resolved.staffProfileId.toHexString(),
          durationMinutes: resolved.offering.durationMinutes,
          bufferBeforeMinutes: resolved.offering.bufferBeforeMinutes,
          bufferAfterMinutes: resolved.offering.bufferAfterMinutes,
          quotedPriceMinor: resolved.offering.quotedPriceMinor,
          startsAt: treatmentStart,
          endsAt,
          bufferedStartsAt,
          bufferedEndsAt
        };
        break;
      }
      if (index === 0) return null;
      treatmentStart = new Date(
        treatmentStart.getTime() + resolved.offering.slotIncrementMinutes * 60_000
      );
      if (localDateAt(treatmentStart, context.timezone) !== context.localDate) return null;
    }
    if (line === null) return null;
    candidateLines.push(line);
    minimumStart = new Date(
      line.bufferedEndsAt.getTime() +
        (context.lines[index + 1]?.offering.bufferBeforeMinutes ?? 0) * 60_000
    );
  }
  return {
    startsAt: candidateLines[0]!.bufferedStartsAt,
    endsAt: candidateLines.at(-1)!.bufferedEndsAt,
    lines: candidateLines
  };
}

function insideAdvanceWindow(
  startsAt: Date,
  evaluatedAt: Date,
  offering: ServiceLocationOfferingDocument
): boolean {
  return (
    startsAt.getTime() >= evaluatedAt.getTime() + offering.minAdvanceMinutes * 60_000 &&
    startsAt.getTime() <= evaluatedAt.getTime() + offering.maxAdvanceDays * 86_400_000
  );
}

async function previewStoredBooking(
  tenantId: Types.ObjectId,
  booking: BookingHydrated,
  evaluatedAt: Date,
  session: ClientSession | null
) {
  const selections = booking.lines.map((line) => ({
    serviceId: objectIdSchema.parse(line.serviceId.toHexString()),
    assignedStaffProfileId: objectIdSchema.parse(line.assignedStaffProfileId.toHexString())
  }));
  let context: EvaluationContext;
  try {
    context = await resolveEvaluationContext(
      tenantId,
      booking.locationId,
      booking.localDate,
      selections,
      session,
      booking._id
    );
  } catch (error) {
    if (error instanceof AvailabilityConfigurationError) {
      throw new DatabaseCommandError("CONFIGURATION_CHANGED");
    }
    throw error;
  }
  const candidateLines: CandidateLine[] = [];
  for (let index = 0; index < context.lines.length; index += 1) {
    const resolved = context.lines[index]!;
    const stored = booking.lines[index]!;
    const startsAt = stored.startsAt;
    const endsAt = new Date(startsAt.getTime() + resolved.offering.durationMinutes * 60_000);
    const bufferedStartsAt = new Date(
      startsAt.getTime() - resolved.offering.bufferBeforeMinutes * 60_000
    );
    const bufferedEndsAt = new Date(
      endsAt.getTime() + resolved.offering.bufferAfterMinutes * 60_000
    );
    if (
      localDateAt(startsAt, context.timezone) !== booking.localDate ||
      !insideAdvanceWindow(startsAt, evaluatedAt, resolved.offering) ||
      !rangeIsContained({ startsAt: bufferedStartsAt, endsAt: bufferedEndsAt }, resolved.free)
    ) {
      throw new DatabaseCommandError("CONFLICT");
    }
    candidateLines.push({
      order: index,
      serviceId: resolved.serviceId.toHexString(),
      serviceName: resolved.serviceName,
      assignedStaffProfileId: resolved.staffProfileId.toHexString(),
      durationMinutes: resolved.offering.durationMinutes,
      bufferBeforeMinutes: resolved.offering.bufferBeforeMinutes,
      bufferAfterMinutes: resolved.offering.bufferAfterMinutes,
      quotedPriceMinor: resolved.offering.quotedPriceMinor,
      startsAt,
      endsAt,
      bufferedStartsAt,
      bufferedEndsAt
    });
  }
  const candidate = {
    startsAt: candidateLines[0]!.bufferedStartsAt,
    endsAt: candidateLines.at(-1)!.bufferedEndsAt,
    lines: candidateLines
  } satisfies Candidate;
  return { context, candidate, guards: context.guardVersions };
}

async function evaluateExistingAt(
  tenantId: Types.ObjectId,
  booking: BookingHydrated,
  localDate: string,
  selections: readonly BookingSelection[],
  startsAt: Date,
  evaluatedAt: Date,
  requireFirstGrid: boolean,
  session: ClientSession | null
) {
  let context: EvaluationContext;
  try {
    context = await resolveEvaluationContext(
      tenantId,
      booking.locationId,
      localDate,
      selections,
      session,
      booking._id
    );
  } catch (error) {
    if (error instanceof AvailabilityConfigurationError) {
      throw new DatabaseCommandError("CONFIGURATION_CHANGED");
    }
    throw error;
  }
  const candidate = buildCandidate(context, startsAt, evaluatedAt, false, requireFirstGrid);
  if (candidate === null) throw new DatabaseCommandError("CONFLICT");
  return { context, candidate, guards: context.guardVersions };
}

function commercialSnapshotMatches(booking: BookingDocument, candidate: Candidate): boolean {
  return booking.lines.every((line, index) => {
    const current = candidate.lines[index];
    return (
      current !== undefined &&
      line.serviceId.toHexString() === current.serviceId &&
      line.serviceName === current.serviceName &&
      line.durationMinutes === current.durationMinutes &&
      line.bufferBeforeMinutes === current.bufferBeforeMinutes &&
      line.bufferAfterMinutes === current.bufferAfterMinutes &&
      line.quotedPriceMinor === current.quotedPriceMinor
    );
  });
}

function assertSameServices(
  booking: BookingDocument,
  selections: readonly BookingSelection[]
): void {
  if (
    booking.lines.length !== selections.length ||
    booking.lines.some(
      (line, index) => line.serviceId.toHexString() !== selections[index]?.serviceId
    )
  ) {
    throw new DatabaseCommandError("CONFIGURATION_CHANGED");
  }
}

async function persistCreatedBooking(
  tenantId: Types.ObjectId,
  actorUserId: Types.ObjectId,
  bookingId: Types.ObjectId,
  input: ReturnType<typeof createBookingCommandSchema.parse>,
  timezone: string,
  candidate: Candidate,
  occurredAt: Date,
  session: ClientSession
): Promise<void> {
  const document = new BookingModel({
    _id: bookingId,
    schemaVersion: 1,
    tenantId,
    locationId: toObjectId(input.locationId),
    localDate: localDateAt(candidate.lines[0]!.startsAt, timezone),
    timezone,
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    status: input.status,
    version: 0,
    source: input.source,
    guest: input.guest,
    lines: candidate.lines.map((line) => ({
      order: line.order,
      assignedStaffProfileId: toObjectId(line.assignedStaffProfileId),
      serviceId: toObjectId(line.serviceId),
      serviceName: line.serviceName,
      durationMinutes: line.durationMinutes,
      bufferBeforeMinutes: line.bufferBeforeMinutes,
      bufferAfterMinutes: line.bufferAfterMinutes,
      quotedPriceMinor: line.quotedPriceMinor,
      startsAt: line.startsAt,
      endsAt: line.endsAt,
      status: "scheduled",
      skippedReasonCode: null
    })),
    deletedAt: null,
    createdAt: occurredAt,
    updatedAt: occurredAt
  });
  await document.validate();
  await BookingModel.collection.insertOne(document.toObject(), { session });
  await appendEvent(
    tenantId,
    bookingId,
    actorUserId,
    0,
    "created",
    null,
    input.status,
    null,
    null,
    occurredAt,
    session
  );
}

async function persistBookingUpdate(
  booking: BookingHydrated,
  patch: Partial<BookingDocument>,
  actorUserId: Types.ObjectId,
  eventType: "confirmed" | "rescheduled",
  reasonCode: string | null,
  note: string | null,
  occurredAt: Date,
  session: ClientSession
): Promise<void> {
  const nextVersion = patch.version!;
  const candidate = BookingModel.hydrate({
    ...booking.toObject(),
    ...patch,
    updatedAt: occurredAt
  });
  await candidate.validate();
  const result = await BookingModel.collection.updateOne(
    { _id: booking._id, tenantId: booking.tenantId, version: booking.version, deletedAt: null },
    { $set: { ...patch, updatedAt: occurredAt } },
    { session }
  );
  if (result.modifiedCount !== 1) throw new DatabaseCommandError("CONFLICT");
  await appendEvent(
    booking.tenantId,
    booking._id,
    actorUserId,
    nextVersion,
    eventType,
    booking.status,
    patch.status ?? booking.status,
    reasonCode,
    note,
    occurredAt,
    session
  );
}

async function appendEvent(
  tenantId: Types.ObjectId,
  bookingId: Types.ObjectId,
  actorUserId: Types.ObjectId,
  version: number,
  eventType: "created" | "confirmed" | "rescheduled",
  fromStatus: BookingDocument["status"] | null,
  toStatus: BookingDocument["status"],
  reasonCode: string | null,
  note: string | null,
  occurredAt: Date,
  session: ClientSession
): Promise<void> {
  const event = new BookingEventModel({
    schemaVersion: 1,
    tenantId,
    bookingId,
    sequence: version,
    eventType,
    actorUserId,
    occurredAt,
    reasonCode,
    note,
    fromStatus,
    toStatus,
    lineOrder: null,
    bookingVersion: version,
    createdAt: occurredAt,
    updatedAt: occurredAt
  });
  await event.validate();
  await BookingEventModel.collection.insertOne(event.toObject(), { session });
}

async function authorizeBookingOperation(
  tenantId: Types.ObjectId,
  userId: Types.ObjectId,
  locationId: Types.ObjectId,
  session: ClientSession | null
): Promise<void> {
  const membership = await MembershipModel.findOne({
    tenantId,
    userId,
    status: "active",
    deletedAt: null
  }).session(session);
  const tenant = await TenantModel.exists({
    _id: tenantId,
    status: "active",
    deletedAt: null
  }).session(session);
  if (membership === null || tenant === null) throw new DatabaseCommandError("FORBIDDEN");
  if (membership.roleKeys.includes("owner")) return;
  if (!membership.roleKeys.some((role) => role === "manager" || role === "receptionist")) {
    throw new DatabaseCommandError("FORBIDDEN");
  }
  const grant = await LocationAccessGrantModel.exists({
    tenantId,
    targetMembershipId: membership._id,
    locationId,
    status: "active",
    revokedAt: null
  }).session(session);
  if (grant === null) throw new DatabaseCommandError("FORBIDDEN");
}

async function readGuardVersions(
  tenantId: Types.ObjectId,
  locationId: Types.ObjectId,
  staffIds: readonly Types.ObjectId[],
  session: ClientSession | null
): Promise<readonly GuardVersion[]> {
  const identities = [
    { scopeType: "location" as const, scopeId: locationId },
    ...staffIds.map((scopeId) => ({ scopeType: "staff" as const, scopeId }))
  ].sort((left, right) =>
    `${left.scopeType}:${left.scopeId.toHexString()}`.localeCompare(
      `${right.scopeType}:${right.scopeId.toHexString()}`
    )
  );
  const rows = await ScheduleGuardModel.find({
    tenantId,
    $or: identities.map(({ scopeType, scopeId }) => ({ scopeType, scopeId }))
  }).session(session);
  const versions = new Map(
    rows.map((row) => [`${row.scopeType}:${row.scopeId.toHexString()}`, row.version])
  );
  return identities.map((identity) => {
    const version = versions.get(`${identity.scopeType}:${identity.scopeId.toHexString()}`);
    return { ...identity, version: version ?? 0, exists: version !== undefined };
  });
}

async function acquireGuards(
  tenantId: Types.ObjectId,
  guards: readonly GuardVersion[],
  occurredAt: Date,
  session: ClientSession
): Promise<void> {
  for (const guard of guards) {
    if (guard.exists) {
      const updated = await ScheduleGuardModel.collection.findOneAndUpdate(
        { tenantId, scopeType: guard.scopeType, scopeId: guard.scopeId, version: guard.version },
        { $currentDate: { updatedAt: true } },
        { returnDocument: "after", session }
      );
      if (updated === null) throw new DatabaseCommandError("CONFLICT");
    } else {
      try {
        await ScheduleGuardModel.collection.insertOne(
          {
            schemaVersion: 1,
            tenantId,
            scopeType: guard.scopeType,
            scopeId: guard.scopeId,
            version: 0,
            createdAt: occurredAt,
            updatedAt: occurredAt
          },
          { session }
        );
      } catch (error) {
        if (isDuplicateKey(error)) throw new DatabaseCommandError("CONFLICT");
        throw error;
      }
    }
  }
}

async function acquireCandidateLocks(
  tenantId: Types.ObjectId,
  candidate: Candidate,
  session: ClientSession
): Promise<void> {
  const identities = new Map<string, { staffProfileId: Types.ObjectId; utcDate: string }>();
  for (const line of candidate.lines) {
    const staffProfileId = toObjectId(line.assignedStaffProfileId);
    for (const utcDate of utcDatesCrossed({
      startsAt: line.bufferedStartsAt,
      endsAt: line.bufferedEndsAt
    })) {
      identities.set(`${staffProfileId.toHexString()}:${utcDate}`, { staffProfileId, utcDate });
    }
  }
  for (const identity of [...identities.values()].sort((left, right) =>
    `${left.staffProfileId.toHexString()}:${left.utcDate}`.localeCompare(
      `${right.staffProfileId.toHexString()}:${right.utcDate}`
    )
  )) {
    await StaffDayLockModel.findOneAndUpdate(
      { tenantId, ...identity },
      { $setOnInsert: { schemaVersion: 1 }, $inc: { version: 1 } },
      { upsert: true, new: true, runValidators: true, session }
    );
  }
}

async function acquireServiceConfigurationLocks(
  tenantId: Types.ObjectId,
  candidate: Candidate,
  missingCode: "CONFLICT" | "CONFIGURATION_CHANGED",
  session: ClientSession
): Promise<void> {
  const serviceIds = [...new Set(candidate.lines.map(({ serviceId }) => serviceId))]
    .sort()
    .map((serviceId) => toObjectId(serviceId));
  for (const serviceId of serviceIds) {
    const service = await ServiceModel.collection.findOneAndUpdate(
      { _id: serviceId, tenantId, status: "active" },
      { $currentDate: { updatedAt: true } },
      { returnDocument: "after", session }
    );
    if (service === null) throw new DatabaseCommandError(missingCode);
  }
}

function candidateLockIdentityKeys(candidate: Candidate): readonly string[] {
  const keys = new Set<string>();
  for (const line of candidate.lines) {
    for (const utcDate of utcDatesCrossed({
      startsAt: line.bufferedStartsAt,
      endsAt: line.bufferedEndsAt
    })) {
      keys.add(`${line.assignedStaffProfileId}:${utcDate}`);
    }
  }
  return [...keys].sort();
}

function assertCandidateLockIdentitiesMatch(acquired: Candidate, persisted: Candidate): void {
  const acquiredKeys = candidateLockIdentityKeys(acquired);
  const persistedKeys = candidateLockIdentityKeys(persisted);
  if (
    acquiredKeys.length !== persistedKeys.length ||
    acquiredKeys.some((key, index) => key !== persistedKeys[index])
  ) {
    throw new DatabaseCommandError("CONFLICT");
  }
}

function unionOldAndNewCandidate(booking: BookingDocument, candidate: Candidate): Candidate {
  const oldLines: CandidateLine[] = booking.lines.map((line, order) => ({
    order,
    serviceId: line.serviceId.toHexString(),
    serviceName: line.serviceName,
    assignedStaffProfileId: line.assignedStaffProfileId.toHexString(),
    durationMinutes: line.durationMinutes,
    bufferBeforeMinutes: line.bufferBeforeMinutes,
    bufferAfterMinutes: line.bufferAfterMinutes,
    quotedPriceMinor: line.quotedPriceMinor,
    startsAt: line.startsAt,
    endsAt: line.endsAt,
    bufferedStartsAt: new Date(line.startsAt.getTime() - line.bufferBeforeMinutes * 60_000),
    bufferedEndsAt: new Date(line.endsAt.getTime() + line.bufferAfterMinutes * 60_000)
  }));
  return {
    startsAt: booking.startsAt,
    endsAt: candidate.endsAt,
    lines: [...oldLines, ...candidate.lines]
  };
}

async function claimReceipt(
  tenantId: Types.ObjectId,
  actorUserId: Types.ObjectId,
  operation: string,
  idempotencyKey: string,
  requestHash: string,
  expectedVersion: number | null,
  occurredAt: Date,
  session: ClientSession
): Promise<ReceiptClaim> {
  const identity = { tenantId, actorUserId, operation, idempotencyKey };
  const existing = await MutationReceiptModel.findOne(identity).session(session);
  if (existing !== null) {
    if (existing.requestHash !== requestHash) throw new DatabaseCommandError("CONFLICT");
    if (existing.status === "succeeded" && existing.entityId !== null) {
      return { replay: true, bookingId: existing.entityId };
    }
    throw new DatabaseCommandError("CONFLICT");
  }
  const receiptId = new MongooseTypes.ObjectId();
  await MutationReceiptModel.collection.insertOne(
    {
      _id: receiptId,
      schemaVersion: 1,
      tenantId,
      actorUserId,
      operation,
      idempotencyKey,
      requestHash,
      status: "processing",
      entityType: null,
      entityId: null,
      expectedVersion,
      completedAt: null,
      createdAt: occurredAt,
      updatedAt: occurredAt
    },
    { session }
  );
  return { replay: false, receiptId };
}

async function readCompletedReplay(
  tenantId: Types.ObjectId,
  actorUserId: Types.ObjectId,
  operation: string,
  idempotencyKey: string,
  requestHash: string
): Promise<BookingCommandResult | null> {
  const receipt = await MutationReceiptModel.findOne({
    tenantId,
    actorUserId,
    operation,
    idempotencyKey
  });
  if (receipt === null) return null;
  if (receipt.requestHash !== requestHash) throw new DatabaseCommandError("CONFLICT");
  if (receipt.status !== "succeeded" || receipt.entityId === null) {
    throw new DatabaseCommandError("CONFLICT");
  }
  const booking = await BookingModel.findOne({
    _id: receipt.entityId,
    tenantId,
    deletedAt: null
  });
  if (booking === null) throw new DatabaseCommandError("NOT_FOUND");
  return bookingCommandResultSchema.parse({ replay: true, booking: bookingDto(booking) });
}

async function completeReceipt(
  tenantId: Types.ObjectId,
  receiptId: Types.ObjectId,
  bookingId: Types.ObjectId,
  completedAt: Date,
  session: ClientSession
): Promise<void> {
  await MutationReceiptModel.collection.updateOne(
    { _id: receiptId, tenantId, status: "processing" },
    {
      $set: {
        status: "succeeded",
        entityType: "booking",
        entityId: bookingId,
        completedAt,
        updatedAt: completedAt
      }
    },
    { session }
  );
}

async function conflictReceipt(
  tenantId: Types.ObjectId,
  receiptId: Types.ObjectId,
  completedAt: Date,
  session: ClientSession
): Promise<void> {
  await MutationReceiptModel.collection.updateOne(
    { _id: receiptId, tenantId, status: "processing" },
    { $set: { status: "conflict", completedAt, updatedAt: completedAt } },
    { session }
  );
}

async function bookingResultFromId(
  tenantId: Types.ObjectId,
  bookingId: Types.ObjectId,
  replay: boolean,
  session: ClientSession
): Promise<BookingCommandResult> {
  const booking = await BookingModel.findOne({ _id: bookingId, tenantId, deletedAt: null }).session(
    session
  );
  if (booking === null) throw new DatabaseCommandError("NOT_FOUND");
  return bookingCommandResultSchema.parse({ replay, booking: bookingDto(booking) });
}

function bookingDto(booking: BookingHydrated) {
  return {
    id: booking._id.toHexString(),
    locationId: booking.locationId.toHexString(),
    localDate: booking.localDate,
    timezone: booking.timezone,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    version: booking.version,
    source: booking.source,
    guest: {
      kind: booking.guest.kind,
      displayName: booking.guest.displayName,
      ...(booking.guest.phone === undefined ? {} : { phone: booking.guest.phone }),
      ...(booking.guest.email === undefined ? {} : { email: booking.guest.email }),
      customerId: null
    },
    lines: booking.lines.map((line) => ({
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
    }))
  };
}

async function locationLocalDate(
  tenantId: Types.ObjectId,
  locationId: Types.ObjectId,
  instant: Date,
  session: ClientSession | null
): Promise<string> {
  const location = await LocationModel.findOne({
    _id: locationId,
    tenantId,
    status: "active",
    deletedAt: null
  })
    .select({ timezone: 1 })
    .session(session);
  if (location === null) throw new DatabaseCommandError("NOT_FOUND");
  return localDateAt(instant, location.timezone);
}

function toAvailabilitySlot(candidate: Candidate): AvailabilitySlot {
  return {
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    lines: candidate.lines.map((line) => ({
      order: line.order,
      serviceId: objectIdSchema.parse(line.serviceId),
      assignedStaffProfileId: objectIdSchema.parse(line.assignedStaffProfileId),
      startsAt: line.startsAt,
      endsAt: line.endsAt,
      bufferedStartsAt: line.bufferedStartsAt,
      bufferedEndsAt: line.bufferedEndsAt
    }))
  };
}

function hashRequest(operation: string, value: unknown): string {
  return createHash("sha256").update(stableJson({ operation, value })).digest("hex");
}

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function now(options: InternalOptions): Date {
  const value = options.clock?.() ?? new Date();
  return new Date(value);
}

async function runTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await getInternalDatabaseConnection().transaction(work);
    } catch (error) {
      if (attempt < 2 && (isWriteConflict(error) || isDuplicateKey(error))) continue;
      if (isWriteConflict(error) || isDuplicateKey(error)) {
        throw new DatabaseCommandError("CONFLICT");
      }
      throw error;
    }
  }
  throw new DatabaseCommandError("CONFLICT");
}

class AvailabilityConfigurationError extends Error {
  constructor(
    readonly reason:
      | "LOCATION_UNAVAILABLE"
      | "SERVICE_UNAVAILABLE"
      | "STAFF_UNAVAILABLE"
      | "SCHEDULE_UNCONFIGURED",
    readonly timezone: string
  ) {
    super(reason);
  }
}
