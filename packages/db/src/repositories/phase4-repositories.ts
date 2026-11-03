import {
  bookingStatusSchema,
  bufferedOccupancyInputSchema,
  dateOverrideIdentitySchema,
  dateOverrideInputSchema,
  localDateSchema,
  locationAccessInputSchema,
  mutationClaimInputSchema,
  mutationCompletionInputSchema,
  objectIdSchema,
  serviceCreateInputSchema,
  serviceOfferingInputSchema,
  serviceUpdateInputSchema,
  staffBookingProfileCreateInputSchema,
  staffLocationInputSchema,
  staffScheduleModeSchema,
  staffServiceInputSchema,
  unavailabilityInputSchema,
  weeklyScheduleSuccessorInputSchema,
  type ScheduleInterval,
  type StaffScheduleMode
} from "@zuridesk/shared";
import type { ClientSession, Types } from "mongoose";

import { getInternalDatabaseConnection } from "../connection";
import { assertTrustedTenantContext, type TrustedTenantContext } from "../context/tenant-context";
import { LocationModel, MembershipModel } from "../models/identity-models";
import {
  BookingModel,
  CalendarDateOverrideModel,
  LocationAccessGrantModel,
  MutationReceiptModel,
  ScheduleGuardModel,
  ServiceLocationOfferingModel,
  ServiceModel,
  StaffBookingProfileModel,
  StaffDayLockModel,
  StaffLocationAssignmentModel,
  StaffServiceEligibilityModel,
  StaffUnavailabilityModel,
  WeeklyScheduleVersionModel
} from "../models/phase4-models";
import { boundedLimit, toObjectId } from "./repository-helpers";

export type Phase41Record = Readonly<Record<string, unknown>>;

function contextIds(context: TrustedTenantContext): {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
} {
  assertTrustedTenantContext(context);
  return {
    tenantId: toObjectId(context.tenantId, "tenantId"),
    userId: toObjectId(context.userId, "userId")
  };
}

function plain(value: unknown): unknown {
  if (value instanceof Date) return new Date(value);
  if (value != null && typeof value === "object" && "toHexString" in value) {
    const candidate = value as { toHexString(): string };
    return objectIdSchema.parse(candidate.toHexString());
  }
  if (Array.isArray(value)) return value.map(plain);
  if (value != null && typeof value === "object") {
    const source =
      "toObject" in value
        ? (value as { toObject(): Record<string, unknown> }).toObject()
        : (value as Record<string, unknown>);
    return Object.fromEntries(
      Object.entries(source)
        .filter(([key]) => key !== "__v")
        .map(([key, nested]) => [key === "_id" ? "id" : key, plain(nested)])
    );
  }
  return value;
}

function record(value: unknown): Phase41Record {
  return plain(value) as Phase41Record;
}

async function requireLocation(
  tenantId: Types.ObjectId,
  locationId: string
): Promise<Types.ObjectId> {
  const id = toObjectId(locationId, "locationId");
  if (
    (await LocationModel.exists({ _id: id, tenantId, status: "active", deletedAt: null })) === null
  ) {
    throw new Error("locationId must identify an active location in the current tenant");
  }
  return id;
}

async function requireProfile(
  tenantId: Types.ObjectId,
  profileId: string
): Promise<Types.ObjectId> {
  const id = toObjectId(profileId, "staffProfileId");
  if ((await StaffBookingProfileModel.exists({ _id: id, tenantId, status: "active" })) === null) {
    throw new Error("staffProfileId must identify an active profile in the current tenant");
  }
  return id;
}

async function requireService(
  tenantId: Types.ObjectId,
  serviceId: string
): Promise<Types.ObjectId> {
  const id = toObjectId(serviceId, "serviceId");
  if ((await ServiceModel.exists({ _id: id, tenantId, status: "active" })) === null) {
    throw new Error("serviceId must identify an active service in the current tenant");
  }
  return id;
}

export const serviceCatalogueRepository = {
  async create(
    context: TrustedTenantContext,
    input: { id?: string; name: string; description?: string | null }
  ): Promise<Phase41Record> {
    const { tenantId } = contextIds(context);
    const parsed = serviceCreateInputSchema.parse(input);
    const document = await ServiceModel.create({
      schemaVersion: 1,
      ...(parsed.id === undefined ? {} : { _id: toObjectId(parsed.id) }),
      tenantId,
      name: parsed.name,
      description: parsed.description ?? null,
      status: "active",
      archivedAt: null
    });
    return record(document);
  },

  async findById(context: TrustedTenantContext, id: string): Promise<Phase41Record | null> {
    const { tenantId } = contextIds(context);
    const document = await ServiceModel.findOne({
      _id: toObjectId(id),
      tenantId,
      status: "active"
    });
    return document === null ? null : record(document);
  },

  async listActive(
    context: TrustedTenantContext,
    limit?: number
  ): Promise<readonly Phase41Record[]> {
    const { tenantId } = contextIds(context);
    const documents = await ServiceModel.find({ tenantId, status: "active" })
      .sort({ name: 1, _id: 1 })
      .limit(boundedLimit(limit));
    return documents.map(record);
  },

  async countActive(context: TrustedTenantContext): Promise<number> {
    const { tenantId } = contextIds(context);
    return ServiceModel.countDocuments({ tenantId, status: "active" });
  },

  async update(
    context: TrustedTenantContext,
    id: string,
    patch: { name?: string; description?: string | null }
  ): Promise<Phase41Record | null> {
    const { tenantId } = contextIds(context);
    const parsed = serviceUpdateInputSchema.parse(patch);
    const document = await ServiceModel.findOne({
      _id: toObjectId(id),
      tenantId,
      status: "active"
    });
    if (document === null) return null;
    if (parsed.name !== undefined) document.name = parsed.name;
    if (parsed.description !== undefined) {
      document.description = parsed.description;
    }
    await document.save();
    return record(document);
  },

  async archive(context: TrustedTenantContext, id: string): Promise<Phase41Record | null> {
    const { tenantId } = contextIds(context);
    const document = await ServiceModel.findOne({
      _id: toObjectId(id),
      tenantId,
      status: "active"
    });
    if (document === null) return null;
    document.status = "archived";
    document.archivedAt = new Date();
    await document.save();
    return record(document);
  }
};

export const staffBookingProfileRepository = {
  async create(
    context: TrustedTenantContext,
    input: { id?: string; membershipId: string; displayName: string }
  ): Promise<Phase41Record> {
    const { tenantId } = contextIds(context);
    const parsed = staffBookingProfileCreateInputSchema.parse(input);
    const membershipId = toObjectId(parsed.membershipId, "membershipId");
    if (
      (await MembershipModel.exists({
        _id: membershipId,
        tenantId,
        status: "active",
        deletedAt: null
      })) === null
    ) {
      throw new Error("membershipId must identify an active current-tenant membership");
    }
    const document = await StaffBookingProfileModel.create({
      schemaVersion: 1,
      ...(parsed.id === undefined ? {} : { _id: toObjectId(parsed.id) }),
      tenantId,
      membershipId,
      displayName: parsed.displayName,
      scheduleMode: "unconfigured",
      status: "active",
      archivedAt: null
    });
    return record(document);
  },

  async setScheduleMode(
    context: TrustedTenantContext,
    id: string,
    mode: StaffScheduleMode
  ): Promise<Phase41Record | null> {
    const { tenantId } = contextIds(context);
    const scheduleMode = staffScheduleModeSchema.parse(mode);
    const document = await StaffBookingProfileModel.findOne({
      _id: toObjectId(id),
      tenantId,
      status: "active"
    });
    if (document === null) return null;
    document.scheduleMode = scheduleMode;
    await document.save();
    return record(document);
  },

  async findByMembership(
    context: TrustedTenantContext,
    membershipId: string
  ): Promise<Phase41Record | null> {
    const { tenantId } = contextIds(context);
    const document = await StaffBookingProfileModel.findOne({
      tenantId,
      membershipId: toObjectId(membershipId),
      status: "active"
    });
    return document === null ? null : record(document);
  },

  async archive(context: TrustedTenantContext, id: string): Promise<Phase41Record | null> {
    const { tenantId } = contextIds(context);
    const document = await StaffBookingProfileModel.findOne({
      _id: toObjectId(id),
      tenantId,
      status: "active"
    });
    if (document === null) return null;
    document.status = "archived";
    document.archivedAt = new Date();
    await document.save();
    return record(document);
  }
};

export const bookingConfigurationRepository = {
  async grantLocationAccess(
    context: TrustedTenantContext,
    input: { targetMembershipId: string; locationId: string }
  ): Promise<Phase41Record> {
    const { tenantId, userId } = contextIds(context);
    const parsed = locationAccessInputSchema.parse(input);
    const targetMembershipId = toObjectId(parsed.targetMembershipId, "targetMembershipId");
    if (
      (await MembershipModel.exists({ _id: targetMembershipId, tenantId, status: "active" })) ===
      null
    ) {
      throw new Error("targetMembershipId must identify an active current-tenant membership");
    }
    const locationId = await requireLocation(tenantId, parsed.locationId);
    const document = await LocationAccessGrantModel.findOneAndUpdate(
      { tenantId, targetMembershipId, locationId },
      {
        $set: { status: "active", revokedAt: null },
        $setOnInsert: { schemaVersion: 1, grantedByUserId: userId }
      },
      { upsert: true, new: true, runValidators: true }
    );
    return record(document);
  },

  async revokeLocationAccess(
    context: TrustedTenantContext,
    input: { targetMembershipId: string; locationId: string }
  ): Promise<Phase41Record | null> {
    const { tenantId } = contextIds(context);
    const parsed = locationAccessInputSchema.parse(input);
    const document = await LocationAccessGrantModel.findOneAndUpdate(
      {
        tenantId,
        targetMembershipId: toObjectId(parsed.targetMembershipId),
        locationId: toObjectId(parsed.locationId),
        status: "active"
      },
      { $set: { status: "revoked", revokedAt: new Date() } },
      { new: true, runValidators: true }
    );
    return document === null ? null : record(document);
  },

  async assignLocation(
    context: TrustedTenantContext,
    input: { staffProfileId: string; locationId: string }
  ): Promise<Phase41Record> {
    const { tenantId } = contextIds(context);
    const parsed = staffLocationInputSchema.parse(input);
    const staffProfileId = await requireProfile(tenantId, parsed.staffProfileId);
    const locationId = await requireLocation(tenantId, parsed.locationId);
    const document = await StaffLocationAssignmentModel.findOneAndUpdate(
      { tenantId, staffProfileId, locationId },
      { $set: { status: "active", archivedAt: null }, $setOnInsert: { schemaVersion: 1 } },
      { upsert: true, new: true, runValidators: true }
    );
    return record(document);
  },

  async setServiceEligibility(
    context: TrustedTenantContext,
    input: { staffProfileId: string; serviceId: string }
  ): Promise<Phase41Record> {
    const { tenantId } = contextIds(context);
    const parsed = staffServiceInputSchema.parse(input);
    const staffProfileId = await requireProfile(tenantId, parsed.staffProfileId);
    const serviceId = await requireService(tenantId, parsed.serviceId);
    const document = await StaffServiceEligibilityModel.findOneAndUpdate(
      { tenantId, staffProfileId, serviceId },
      { $set: { status: "active", archivedAt: null }, $setOnInsert: { schemaVersion: 1 } },
      { upsert: true, new: true, runValidators: true }
    );
    return record(document);
  },

  async configureOffering(
    context: TrustedTenantContext,
    input: {
      serviceId: string;
      locationId: string;
      durationMinutes: number;
      bufferBeforeMinutes: number;
      bufferAfterMinutes: number;
      quotedPriceMinor: number;
      slotIncrementMinutes: number;
      minAdvanceMinutes: number;
      maxAdvanceDays: number;
    }
  ): Promise<Phase41Record> {
    const { tenantId } = contextIds(context);
    const parsed = serviceOfferingInputSchema.parse(input);
    const serviceId = await requireService(tenantId, parsed.serviceId);
    const locationId = await requireLocation(tenantId, parsed.locationId);
    const document = await ServiceLocationOfferingModel.findOneAndUpdate(
      { tenantId, serviceId, locationId },
      {
        $set: {
          durationMinutes: parsed.durationMinutes,
          bufferBeforeMinutes: parsed.bufferBeforeMinutes,
          bufferAfterMinutes: parsed.bufferAfterMinutes,
          quotedPriceMinor: parsed.quotedPriceMinor,
          slotIncrementMinutes: parsed.slotIncrementMinutes,
          minAdvanceMinutes: parsed.minAdvanceMinutes,
          maxAdvanceDays: parsed.maxAdvanceDays,
          status: "active",
          archivedAt: null
        },
        $setOnInsert: { schemaVersion: 1 }
      },
      { upsert: true, new: true, runValidators: true }
    );
    return record(document);
  },

  async listOfferings(
    context: TrustedTenantContext,
    locationId: string,
    limit?: number
  ): Promise<readonly Phase41Record[]> {
    const { tenantId } = contextIds(context);
    const documents = await ServiceLocationOfferingModel.find({
      tenantId,
      locationId: toObjectId(locationId),
      status: "active"
    })
      .sort({ serviceId: 1 })
      .limit(boundedLimit(limit));
    return documents.map(record);
  },

  async archiveLocationAssignment(
    context: TrustedTenantContext,
    input: { staffProfileId: string; locationId: string }
  ): Promise<Phase41Record | null> {
    const { tenantId } = contextIds(context);
    const parsed = staffLocationInputSchema.parse(input);
    const document = await StaffLocationAssignmentModel.findOneAndUpdate(
      {
        tenantId,
        staffProfileId: toObjectId(parsed.staffProfileId),
        locationId: toObjectId(parsed.locationId),
        status: "active"
      },
      { $set: { status: "archived", archivedAt: new Date() } },
      { new: true, runValidators: true }
    );
    return document === null ? null : record(document);
  },

  async archiveServiceEligibility(
    context: TrustedTenantContext,
    input: { staffProfileId: string; serviceId: string }
  ): Promise<Phase41Record | null> {
    const { tenantId } = contextIds(context);
    const parsed = staffServiceInputSchema.parse(input);
    const document = await StaffServiceEligibilityModel.findOneAndUpdate(
      {
        tenantId,
        staffProfileId: toObjectId(parsed.staffProfileId),
        serviceId: toObjectId(parsed.serviceId),
        status: "active"
      },
      { $set: { status: "archived", archivedAt: new Date() } },
      { new: true, runValidators: true }
    );
    return document === null ? null : record(document);
  },

  async archiveOffering(
    context: TrustedTenantContext,
    input: { serviceId: string; locationId: string }
  ): Promise<Phase41Record | null> {
    const { tenantId } = contextIds(context);
    const parsed = serviceOfferingInputSchema
      .pick({ serviceId: true, locationId: true })
      .parse(input);
    const document = await ServiceLocationOfferingModel.findOneAndUpdate(
      {
        tenantId,
        serviceId: toObjectId(parsed.serviceId),
        locationId: toObjectId(parsed.locationId),
        status: "active"
      },
      { $set: { status: "archived", archivedAt: new Date() } },
      { new: true, runValidators: true }
    );
    return document === null ? null : record(document);
  }
};

async function requireScheduleOwner(
  tenantId: Types.ObjectId,
  ownerType: "location" | "staff",
  ownerId: string
): Promise<Types.ObjectId> {
  return ownerType === "location"
    ? requireLocation(tenantId, ownerId)
    : requireProfile(tenantId, ownerId);
}

async function assertScheduleTimezone(
  tenantId: Types.ObjectId,
  ownerType: "location" | "staff",
  ownerId: Types.ObjectId,
  timezone: string
): Promise<string> {
  const validTimezone = validateTimezone(timezone);
  if (ownerType !== "location") return validTimezone;
  const location = await LocationModel.findOne({
    _id: ownerId,
    tenantId,
    status: "active",
    deletedAt: null
  }).select({ timezone: 1 });
  if (location === null || location.timezone !== validTimezone) {
    throw new Error("Location schedule timezone must match the location timezone");
  }
  return validTimezone;
}

type ScheduleGuardIdentity = Readonly<{
  tenantId: Types.ObjectId;
  scopeType: "location" | "staff";
  scopeId: Types.ObjectId;
}>;

async function observeScheduleGuard(identity: ScheduleGuardIdentity): Promise<number | null> {
  const guard = await ScheduleGuardModel.findOne(identity).select({ version: 1 });
  return guard?.version ?? null;
}

async function acquireObservedScheduleGuard(
  identity: ScheduleGuardIdentity,
  observedVersion: number | null,
  session: ClientSession
): Promise<void> {
  const guard =
    observedVersion === null
      ? await ScheduleGuardModel.findOneAndUpdate(
          { ...identity, version: { $exists: false } },
          { $setOnInsert: { schemaVersion: 1 }, $inc: { version: 1 } },
          { upsert: true, returnDocument: "after", runValidators: true, session }
        )
      : await ScheduleGuardModel.findOneAndUpdate(
          { ...identity, version: observedVersion },
          { $inc: { version: 1 } },
          { returnDocument: "after", runValidators: true, session }
        );
  if (guard === null) throw new Error("Schedule guard conflict: scope changed before mutation");
}

function validateTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    throw new Error("timezone must be a valid IANA timezone");
  }
}

function previousLocalDate(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const instant = new Date(Date.UTC(year!, month! - 1, day));
  instant.setUTCDate(instant.getUTCDate() - 1);
  return instant.toISOString().slice(0, 10);
}

function scheduleConflict(error: unknown): never {
  if (error instanceof Error && error.message.startsWith("Schedule successor conflict:")) {
    throw error;
  }
  if (error instanceof Error && error.message.startsWith("Schedule guard conflict:")) {
    throw new Error("Schedule successor conflict: schedule guard changed", { cause: error });
  }
  const mongoError = error as {
    code?: number;
    hasErrorLabel?: (label: string) => boolean;
  };
  if (
    mongoError.code === 11000 ||
    mongoError.hasErrorLabel?.("TransientTransactionError") === true
  ) {
    throw new Error("Schedule successor conflict: another successor won the race", {
      cause: error
    });
  }
  throw error;
}

function dateOverrideConflict(error: unknown): never {
  if (error instanceof Error && error.message.startsWith("Date override conflict:")) throw error;
  if (error instanceof Error && error.message.startsWith("Schedule guard conflict:")) {
    throw new Error("Date override conflict: schedule guard changed", { cause: error });
  }
  const mongoError = error as {
    code?: number;
    hasErrorLabel?: (label: string) => boolean;
  };
  if (
    mongoError.code === 11000 ||
    mongoError.hasErrorLabel?.("TransientTransactionError") === true
  ) {
    throw new Error("Date override conflict: another replacement won the race", {
      cause: error
    });
  }
  throw error;
}

async function validateOverrideOwnerAndTimezone(
  tenantId: Types.ObjectId,
  ownerType: "location" | "staff",
  ownerId: Types.ObjectId,
  localDate: string,
  timezone: string,
  session: ClientSession
): Promise<string> {
  const validTimezone = validateTimezone(timezone);
  if (ownerType === "location") {
    const location = await LocationModel.findOne({
      _id: ownerId,
      tenantId,
      status: "active",
      deletedAt: null
    })
      .select({ timezone: 1 })
      .session(session);
    if (location === null) {
      throw new Error("ownerId must identify an active location in the current tenant");
    }
    if (location.timezone !== validTimezone) {
      throw new Error("Location schedule timezone must match the location timezone");
    }
    return validTimezone;
  }
  if (
    (await StaffBookingProfileModel.exists({
      _id: ownerId,
      tenantId,
      status: "active"
    }).session(session)) === null
  ) {
    throw new Error("ownerId must identify an active staff profile in the current tenant");
  }
  const schedules = await WeeklyScheduleVersionModel.find({
    tenantId,
    ownerType: "staff",
    ownerId,
    archivedAt: null,
    effectiveFrom: { $lte: localDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: localDate } }]
  })
    .sort({ effectiveFrom: -1 })
    .limit(2)
    .select({ timezone: 1 })
    .session(session);
  if (schedules.length !== 1 || schedules[0]!.timezone !== validTimezone) {
    throw new Error("Staff override timezone must match its effective schedule version");
  }
  return validTimezone;
}

export const bookingScheduleRepository = {
  async createWeeklyScheduleSuccessor(
    context: TrustedTenantContext,
    input: {
      ownerType: "location" | "staff";
      ownerId: string;
      timezone: string;
      effectiveFrom: string;
      week: Array<{
        weekday: number;
        intervals: Array<{ startMinute: number; endMinute: number }>;
      }>;
    }
  ): Promise<Phase41Record> {
    const { tenantId, userId } = contextIds(context);
    const parsed = weeklyScheduleSuccessorInputSchema.parse(input);
    const ownerId = await requireScheduleOwner(tenantId, parsed.ownerType, parsed.ownerId);
    const timezone = await assertScheduleTimezone(
      tenantId,
      parsed.ownerType,
      ownerId,
      parsed.timezone
    );
    const guardIdentity = {
      tenantId,
      scopeType: parsed.ownerType,
      scopeId: ownerId
    } as const;
    const observedGuardVersion = await observeScheduleGuard(guardIdentity);
    try {
      return await getInternalDatabaseConnection().transaction(async (session) => {
        await acquireObservedScheduleGuard(guardIdentity, observedGuardVersion, session);
        const current = await WeeklyScheduleVersionModel.findOne({
          tenantId,
          ownerType: parsed.ownerType,
          ownerId,
          archivedAt: null,
          effectiveTo: null
        }).session(session);
        if (current === null) {
          const historicalCount = await WeeklyScheduleVersionModel.countDocuments({
            tenantId,
            ownerType: parsed.ownerType,
            ownerId,
            archivedAt: null
          }).session(session);
          if (historicalCount !== 0) {
            throw new Error(
              "Schedule successor conflict: history exists without one open-ended version"
            );
          }
        } else {
          if (parsed.effectiveFrom <= current.effectiveFrom) {
            throw new Error(
              "Schedule successor conflict: effectiveFrom must follow the current version"
            );
          }
          current.effectiveTo = previousLocalDate(parsed.effectiveFrom);
          await current.save({ session });
        }
        const [successor] = await WeeklyScheduleVersionModel.create(
          [
            {
              schemaVersion: 1,
              tenantId,
              ownerType: parsed.ownerType,
              ownerId,
              timezone,
              effectiveFrom: parsed.effectiveFrom,
              effectiveTo: null,
              week: parsed.week,
              createdByUserId: userId,
              archivedAt: null
            }
          ],
          { session }
        );
        if (successor === undefined) throw new Error("Schedule successor insertion failed");
        return record(successor);
      });
    } catch (error) {
      return scheduleConflict(error);
    }
  },

  async setDateOverride(
    context: TrustedTenantContext,
    input: {
      ownerType: "location" | "staff";
      ownerId: string;
      timezone: string;
      localDate: string;
      intervals: readonly ScheduleInterval[];
    }
  ): Promise<Phase41Record> {
    const { tenantId, userId } = contextIds(context);
    const parsed = dateOverrideInputSchema.parse(input);
    const ownerId = toObjectId(parsed.ownerId, "ownerId");
    const guardIdentity = {
      tenantId,
      scopeType: parsed.ownerType,
      scopeId: ownerId
    } as const;
    const observedGuardVersion = await observeScheduleGuard(guardIdentity);
    const identity = {
      tenantId,
      ownerType: parsed.ownerType,
      ownerId,
      localDate: parsed.localDate,
      archivedAt: null
    };
    const observed = await CalendarDateOverrideModel.findOne(identity).select({ _id: 1 });
    try {
      return await getInternalDatabaseConnection().transaction(async (session) => {
        await acquireObservedScheduleGuard(guardIdentity, observedGuardVersion, session);
        const timezone = await validateOverrideOwnerAndTimezone(
          tenantId,
          parsed.ownerType,
          ownerId,
          parsed.localDate,
          parsed.timezone,
          session
        );
        const current = await CalendarDateOverrideModel.findOne(identity).session(session);
        if (
          (observed === null && current !== null) ||
          (observed !== null && (current === null || !current._id.equals(observed._id)))
        ) {
          throw new Error("Date override conflict: live override changed before replacement");
        }
        if (current !== null) {
          current.archivedAt = new Date();
          await current.save({ session });
        }
        const [replacement] = await CalendarDateOverrideModel.create(
          [
            {
              schemaVersion: 1,
              tenantId,
              ownerType: parsed.ownerType,
              ownerId,
              timezone,
              localDate: parsed.localDate,
              intervals: parsed.intervals,
              createdByUserId: userId,
              archivedAt: null
            }
          ],
          { session }
        );
        if (replacement === undefined) throw new Error("Date override replacement failed");
        return record(replacement);
      });
    } catch (error) {
      return dateOverrideConflict(error);
    }
  },

  async listEffectiveVersions(
    context: TrustedTenantContext,
    input: { ownerType: "location" | "staff"; ownerId: string; localDate: string }
  ): Promise<readonly Phase41Record[]> {
    const { tenantId } = contextIds(context);
    const documents = await WeeklyScheduleVersionModel.find({
      tenantId,
      ownerType: input.ownerType,
      ownerId: toObjectId(input.ownerId),
      archivedAt: null,
      effectiveFrom: { $lte: localDateSchema.parse(input.localDate) },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: input.localDate } }]
    }).sort({ effectiveFrom: -1 });
    return documents.map(record);
  },

  async createUnavailability(
    context: TrustedTenantContext,
    input: { staffProfileId: string; startsAt: Date; endsAt: Date; reasonCode: string }
  ): Promise<Phase41Record> {
    const { tenantId, userId } = contextIds(context);
    const parsed = unavailabilityInputSchema.parse(input);
    const staffProfileId = await requireProfile(tenantId, parsed.staffProfileId);
    const document = await StaffUnavailabilityModel.create({
      schemaVersion: 1,
      tenantId,
      staffProfileId,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      reasonCode: parsed.reasonCode,
      authorizedByUserId: userId,
      archivedAt: null
    });
    return record(document);
  },

  async archiveDateOverride(
    context: TrustedTenantContext,
    input: { ownerType: "location" | "staff"; ownerId: string; localDate: string }
  ): Promise<Phase41Record | null> {
    const { tenantId } = contextIds(context);
    const parsed = dateOverrideIdentitySchema.parse(input);
    const ownerId = toObjectId(parsed.ownerId, "ownerId");
    const guardIdentity = {
      tenantId,
      scopeType: parsed.ownerType,
      scopeId: ownerId
    } as const;
    const observedGuardVersion = await observeScheduleGuard(guardIdentity);
    try {
      return await getInternalDatabaseConnection().transaction(async (session) => {
        await acquireObservedScheduleGuard(guardIdentity, observedGuardVersion, session);
        const ownerExists =
          parsed.ownerType === "location"
            ? await LocationModel.exists({
                _id: ownerId,
                tenantId,
                status: "active",
                deletedAt: null
              }).session(session)
            : await StaffBookingProfileModel.exists({
                _id: ownerId,
                tenantId,
                status: "active"
              }).session(session);
        if (ownerExists === null) {
          throw new Error("ownerId must identify an active schedule owner in the current tenant");
        }
        const document = await CalendarDateOverrideModel.findOne({
          tenantId,
          ownerType: parsed.ownerType,
          ownerId,
          localDate: parsed.localDate,
          archivedAt: null
        }).session(session);
        if (document === null) return null;
        document.archivedAt = new Date();
        await document.save({ session });
        return record(document);
      });
    } catch (error) {
      return dateOverrideConflict(error);
    }
  },

  async archiveUnavailability(
    context: TrustedTenantContext,
    id: string
  ): Promise<Phase41Record | null> {
    const { tenantId } = contextIds(context);
    const document = await StaffUnavailabilityModel.findOneAndUpdate(
      { _id: toObjectId(id), tenantId, archivedAt: null },
      { $set: { archivedAt: new Date() } },
      { new: true, runValidators: true }
    );
    return document === null ? null : record(document);
  }
};

export const bookingReadRepository = {
  async findById(context: TrustedTenantContext, id: string): Promise<Phase41Record | null> {
    const { tenantId } = contextIds(context);
    const document = await BookingModel.findOne({
      _id: toObjectId(id),
      tenantId,
      deletedAt: null
    });
    return document === null ? null : record(document);
  },

  async countByStatus(context: TrustedTenantContext, status: string): Promise<number> {
    const { tenantId } = contextIds(context);
    return BookingModel.countDocuments({
      tenantId,
      status: bookingStatusSchema.parse(status),
      deletedAt: null
    });
  },

  async listByStatus(
    context: TrustedTenantContext,
    status: string,
    limit?: number
  ): Promise<readonly Phase41Record[]> {
    const { tenantId } = contextIds(context);
    const documents = await BookingModel.find({
      tenantId,
      status: bookingStatusSchema.parse(status),
      deletedAt: null
    })
      .sort({ startsAt: 1, _id: 1 })
      .limit(boundedLimit(limit));
    return documents.map(record);
  },

  async aggregateDailyCounts(
    context: TrustedTenantContext,
    locationId: string
  ): Promise<readonly Phase41Record[]> {
    const { tenantId } = contextIds(context);
    const result = await BookingModel.aggregate([
      { $match: { tenantId, locationId: toObjectId(locationId), deletedAt: null } },
      { $group: { _id: "$localDate", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    return result.map(record);
  }
};

function utcDatesCrossed(startsAt: Date, endsAt: Date): readonly string[] {
  const dates: string[] = [];
  const cursor = new Date(
    Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate())
  );
  const finalInstant = new Date(endsAt.getTime() - 1);
  const finalDay = Date.UTC(
    finalInstant.getUTCFullYear(),
    finalInstant.getUTCMonth(),
    finalInstant.getUTCDate()
  );
  while (cursor.getTime() <= finalDay) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export const bookingConcurrencyRepository = {
  async acquireStaffUtcDayLocks(
    context: TrustedTenantContext,
    input: { staffProfileId: string; bufferedStartsAt: Date; bufferedEndsAt: Date }
  ): Promise<readonly Phase41Record[]> {
    const { tenantId } = contextIds(context);
    const parsed = bufferedOccupancyInputSchema.parse(input);
    const staffProfileId = await requireProfile(tenantId, parsed.staffProfileId);
    const utcDates = utcDatesCrossed(parsed.bufferedStartsAt, parsed.bufferedEndsAt);
    return getInternalDatabaseConnection().transaction(async (session) => {
      const locks: Phase41Record[] = [];
      for (const utcDate of utcDates) {
        const document = await StaffDayLockModel.findOneAndUpdate(
          { tenantId, staffProfileId, utcDate },
          { $setOnInsert: { schemaVersion: 1 }, $inc: { version: 1 } },
          { upsert: true, returnDocument: "after", runValidators: true, session }
        );
        if (document === null) throw new Error("Staff UTC day lock acquisition failed");
        locks.push(record(document));
      }
      return locks;
    });
  },

  async claimMutation(
    context: TrustedTenantContext,
    input: {
      operation: string;
      idempotencyKey: string;
      requestHash: string;
      expectedVersion?: number | null;
    }
  ): Promise<{ readonly receipt: Phase41Record; readonly replay: boolean }> {
    const { tenantId, userId } = contextIds(context);
    const parsed = mutationClaimInputSchema.parse(input);
    const identity = {
      tenantId,
      actorUserId: userId,
      operation: parsed.operation,
      idempotencyKey: parsed.idempotencyKey
    };
    let inserted = false;
    try {
      const result = await MutationReceiptModel.updateOne(
        identity,
        {
          $setOnInsert: {
            schemaVersion: 1,
            requestHash: parsed.requestHash,
            status: "processing",
            entityType: null,
            entityId: null,
            expectedVersion: parsed.expectedVersion ?? null,
            completedAt: null
          }
        },
        { upsert: true, runValidators: true }
      );
      inserted = result.upsertedCount === 1;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    const document = await MutationReceiptModel.findOne(identity);
    if (document === null) throw new Error("Mutation receipt claim failed");
    if (document.requestHash !== parsed.requestHash) {
      throw new Error("Idempotency conflict: key was already used with a different request");
    }
    return { receipt: record(document), replay: !inserted };
  },

  async completeMutation(
    context: TrustedTenantContext,
    input: {
      receiptId: string;
      status: "succeeded" | "conflict" | "failed";
      entityType?: string | null;
      entityId?: string | null;
    }
  ): Promise<{ readonly receipt: Phase41Record; readonly replay: boolean }> {
    const { tenantId, userId } = contextIds(context);
    const parsed = mutationCompletionInputSchema.parse(input);
    const entityType = parsed.entityType ?? null;
    const entityId = parsed.entityId == null ? null : toObjectId(parsed.entityId);
    const document = await MutationReceiptModel.findOneAndUpdate(
      {
        _id: toObjectId(parsed.receiptId),
        tenantId,
        actorUserId: userId,
        status: "processing",
        completedAt: null
      },
      { $set: { status: parsed.status, entityType, entityId, completedAt: new Date() } },
      { returnDocument: "after", runValidators: true }
    );
    if (document !== null) return { receipt: record(document), replay: false };
    const existing = await MutationReceiptModel.findOne({
      _id: toObjectId(parsed.receiptId),
      tenantId,
      actorUserId: userId
    });
    if (
      existing !== null &&
      existing.status === parsed.status &&
      existing.entityType === entityType &&
      (existing.entityId?.equals(entityId) ?? entityId === null)
    ) {
      return { receipt: record(existing), replay: true };
    }
    throw new Error("Mutation receipt completion conflict");
  }
};
