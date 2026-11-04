import {
  bookingCatalogueResultSchema,
  bookingDtoSchema,
  bookingListQuerySchema,
  bookingListResultSchema,
  bookingLocationListResultSchema,
  objectIdSchema,
  type BookingCatalogueResult,
  type BookingDto,
  type BookingListQuery,
  type BookingListResult,
  type BookingLocationListResult,
  type BookingStatus
} from "@zuridesk/shared";
import type { QueryFilter, Types } from "mongoose";

import { assertTrustedTenantContext, type TrustedTenantContext } from "../context/tenant-context";
import { LocationModel, MembershipModel, TenantModel } from "../models/identity-models";
import {
  BookingModel,
  LocationAccessGrantModel,
  ServiceLocationOfferingModel,
  ServiceModel,
  StaffBookingProfileModel,
  StaffLocationAssignmentModel,
  StaffServiceEligibilityModel,
  type BookingDocument
} from "../models/phase4-models";
import { toObjectId } from "../repositories/repository-helpers";
import { DatabaseCommandError } from "./errors";

type BookingReadScope =
  | { readonly kind: "tenant" }
  | { readonly kind: "locations"; readonly locationIds: readonly Types.ObjectId[] }
  | { readonly kind: "staff"; readonly staffProfileIds: readonly Types.ObjectId[] };

export async function getBookingCatalogue(
  context: TrustedTenantContext,
  locationIdValue: string
): Promise<BookingCatalogueResult> {
  assertTrustedTenantContext(context);
  const tenantId = toObjectId(context.tenantId, "tenantId");
  const userId = toObjectId(context.userId, "userId");
  const locationId = toObjectId(locationIdValue, "locationId");
  const membership = await requireLiveMembership(tenantId, userId);
  await authorizeCatalogueLocation(tenantId, membership, locationId);

  const offerings = await ServiceLocationOfferingModel.find({
    tenantId,
    locationId,
    status: "active",
    archivedAt: null
  }).lean();
  const serviceIds = offerings.map(({ serviceId }) => serviceId);
  const [services, eligibility, assignments] = await Promise.all([
    ServiceModel.find({
      tenantId,
      _id: { $in: serviceIds },
      status: "active",
      archivedAt: null
    }).lean(),
    StaffServiceEligibilityModel.find({
      tenantId,
      serviceId: { $in: serviceIds },
      status: "active",
      archivedAt: null
    }).lean(),
    StaffLocationAssignmentModel.find({
      tenantId,
      locationId,
      status: "active",
      archivedAt: null
    }).lean()
  ]);
  const assignedStaffIds = new Set(
    assignments.map(({ staffProfileId }) => staffProfileId.toHexString())
  );
  const eligibleStaffIds = [
    ...new Set(
      eligibility
        .map(({ staffProfileId }) => staffProfileId.toHexString())
        .filter((staffProfileId) => assignedStaffIds.has(staffProfileId))
    )
  ].map((staffProfileId) => toObjectId(staffProfileId));
  const profiles = await StaffBookingProfileModel.find({
    tenantId,
    _id: { $in: eligibleStaffIds },
    status: "active",
    archivedAt: null
  }).lean();
  const liveMembershipIds = new Set(
    (
      await MembershipModel.find({
        tenantId,
        _id: { $in: profiles.map(({ membershipId }) => membershipId) },
        status: "active",
        deletedAt: null
      })
        .select({ _id: 1 })
        .lean()
    ).map(({ _id }) => _id.toHexString())
  );
  const profileById = new Map(
    profiles
      .filter(({ membershipId }) => liveMembershipIds.has(membershipId.toHexString()))
      .map((profile) => [profile._id.toHexString(), profile])
  );
  const serviceById = new Map(services.map((service) => [service._id.toHexString(), service]));
  const eligibleByService = new Map<string, Set<string>>();
  for (const row of eligibility) {
    const staffProfileId = row.staffProfileId.toHexString();
    if (!assignedStaffIds.has(staffProfileId) || !profileById.has(staffProfileId)) continue;
    const serviceId = row.serviceId.toHexString();
    const current = eligibleByService.get(serviceId) ?? new Set<string>();
    current.add(staffProfileId);
    eligibleByService.set(serviceId, current);
  }

  const servicesResult = offerings
    .flatMap((offering) => {
      const service = serviceById.get(offering.serviceId.toHexString());
      if (service === undefined) return [];
      const eligibleStaff = [...(eligibleByService.get(service._id.toHexString()) ?? [])]
        .map((profileId) => profileById.get(profileId)!)
        .sort(
          (left, right) =>
            left.displayName.localeCompare(right.displayName) ||
            left._id.toHexString().localeCompare(right._id.toHexString())
        )
        .map((profile) => ({
          id: objectIdSchema.parse(profile._id.toHexString()),
          displayName: profile.displayName
        }));
      return [
        {
          id: objectIdSchema.parse(service._id.toHexString()),
          name: service.name,
          description: service.description,
          offering: {
            durationMinutes: offering.durationMinutes,
            bufferBeforeMinutes: offering.bufferBeforeMinutes,
            bufferAfterMinutes: offering.bufferAfterMinutes,
            quotedPriceMinor: offering.quotedPriceMinor,
            slotIncrementMinutes: offering.slotIncrementMinutes,
            minAdvanceMinutes: offering.minAdvanceMinutes,
            maxAdvanceDays: offering.maxAdvanceDays
          },
          eligibleStaff
        }
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  return bookingCatalogueResultSchema.parse({
    locationId: objectIdSchema.parse(locationId.toHexString()),
    services: servicesResult
  });
}

export async function listBookingLocations(
  context: TrustedTenantContext
): Promise<BookingLocationListResult> {
  assertTrustedTenantContext(context);
  const tenantId = toObjectId(context.tenantId, "tenantId");
  const membership = await requireLiveMembership(tenantId, toObjectId(context.userId, "userId"));
  const scope = await bookingReadScope(tenantId, membership);
  const locations = await LocationModel.find({
    tenantId,
    status: "active",
    deletedAt: null,
    ...(scope.kind === "locations" ? { _id: { $in: scope.locationIds } } : {}),
    ...(scope.kind === "staff"
      ? {
          _id: {
            $in: await StaffLocationAssignmentModel.distinct("locationId", {
              tenantId,
              staffProfileId: { $in: scope.staffProfileIds },
              status: "active",
              archivedAt: null
            })
          }
        }
      : {})
  })
    .sort({ name: 1, _id: 1 })
    .lean();
  return bookingLocationListResultSchema.parse({
    locations: locations.map((location) => ({
      id: location._id.toHexString(),
      name: location.name,
      timezone: location.timezone
    }))
  });
}

export async function listBookings(
  context: TrustedTenantContext,
  input: BookingListQuery
): Promise<BookingListResult> {
  assertTrustedTenantContext(context);
  const parsed = bookingListQuerySchema.parse(input);
  const tenantId = toObjectId(context.tenantId, "tenantId");
  const membership = await requireLiveMembership(tenantId, toObjectId(context.userId, "userId"));
  const scope = await bookingReadScope(tenantId, membership);
  const filter = bookingFilter(tenantId, scope, parsed);
  const documents = await BookingModel.find(filter)
    .sort({ startsAt: 1, _id: 1 })
    .limit(parsed.limit);
  return bookingListResultSchema.parse({
    bookings: documents.map((booking) => bookingDto(booking, scope.kind === "staff"))
  });
}

export async function getBooking(
  context: TrustedTenantContext,
  bookingIdValue: string
): Promise<BookingDto> {
  assertTrustedTenantContext(context);
  const tenantId = toObjectId(context.tenantId, "tenantId");
  const membership = await requireLiveMembership(tenantId, toObjectId(context.userId, "userId"));
  const scope = await bookingReadScope(tenantId, membership);
  const document = await BookingModel.findOne({
    _id: toObjectId(bookingIdValue, "bookingId"),
    ...bookingFilter(tenantId, scope, {})
  });
  if (document === null) throw new DatabaseCommandError("NOT_FOUND");
  return bookingDtoSchema.parse(bookingDto(document, scope.kind === "staff"));
}

async function requireLiveMembership(tenantId: Types.ObjectId, userId: Types.ObjectId) {
  const [tenant, membership] = await Promise.all([
    TenantModel.exists({ _id: tenantId, status: "active", deletedAt: null }),
    MembershipModel.findOne({ tenantId, userId, status: "active", deletedAt: null })
  ]);
  if (tenant === null || membership === null) throw new DatabaseCommandError("FORBIDDEN");
  return membership;
}

async function authorizeCatalogueLocation(
  tenantId: Types.ObjectId,
  membership: Awaited<ReturnType<typeof requireLiveMembership>>,
  locationId: Types.ObjectId
): Promise<void> {
  const location = await LocationModel.exists({
    _id: locationId,
    tenantId,
    status: "active",
    deletedAt: null
  });
  if (location === null) throw new DatabaseCommandError("NOT_FOUND");
  if (membership.roleKeys.includes("owner")) return;
  if (membership.roleKeys.some((role) => role === "manager" || role === "receptionist")) {
    const grant = await LocationAccessGrantModel.exists({
      tenantId,
      targetMembershipId: membership._id,
      locationId,
      status: "active",
      revokedAt: null
    });
    if (grant !== null) return;
  }
  if (membership.roleKeys.includes("stylist")) {
    const profiles = await StaffBookingProfileModel.find({
      tenantId,
      membershipId: membership._id,
      status: "active",
      archivedAt: null
    }).select({ _id: 1 });
    const assignment = await StaffLocationAssignmentModel.exists({
      tenantId,
      staffProfileId: { $in: profiles.map(({ _id }) => _id) },
      locationId,
      status: "active",
      archivedAt: null
    });
    if (assignment !== null) return;
  }
  throw new DatabaseCommandError("FORBIDDEN");
}

async function bookingReadScope(
  tenantId: Types.ObjectId,
  membership: Awaited<ReturnType<typeof requireLiveMembership>>
): Promise<BookingReadScope> {
  if (membership.roleKeys.includes("owner")) return { kind: "tenant" };
  if (membership.roleKeys.some((role) => role === "manager" || role === "receptionist")) {
    const grants = await LocationAccessGrantModel.find({
      tenantId,
      targetMembershipId: membership._id,
      status: "active",
      revokedAt: null
    }).select({ locationId: 1 });
    return { kind: "locations", locationIds: grants.map(({ locationId }) => locationId) };
  }
  if (membership.roleKeys.includes("stylist")) {
    const profiles = await StaffBookingProfileModel.find({
      tenantId,
      membershipId: membership._id
    }).select({ _id: 1 });
    return { kind: "staff", staffProfileIds: profiles.map(({ _id }) => _id) };
  }
  throw new DatabaseCommandError("FORBIDDEN");
}

function bookingFilter(
  tenantId: Types.ObjectId,
  scope: BookingReadScope,
  input: {
    readonly status?: BookingStatus | undefined;
    readonly locationId?: string | undefined;
    readonly localDateFrom?: string | undefined;
    readonly localDateTo?: string | undefined;
  }
): QueryFilter<BookingDocument> {
  const filter: QueryFilter<BookingDocument> = { tenantId, deletedAt: null };
  if (scope.kind === "locations") filter.locationId = { $in: scope.locationIds };
  if (scope.kind === "staff") {
    filter["lines.assignedStaffProfileId"] = { $in: scope.staffProfileIds };
  }
  if (input.locationId !== undefined) {
    const requested = toObjectId(input.locationId, "locationId");
    if (
      scope.kind === "locations" &&
      !scope.locationIds.some((locationId) => locationId.equals(requested))
    ) {
      filter.locationId = { $in: [] };
    } else {
      filter.locationId = requested;
    }
  }
  if (input.status !== undefined) filter.status = input.status;
  if (input.localDateFrom !== undefined || input.localDateTo !== undefined) {
    filter.localDate = {
      ...(input.localDateFrom === undefined ? {} : { $gte: input.localDateFrom }),
      ...(input.localDateTo === undefined ? {} : { $lte: input.localDateTo })
    };
  }
  return filter;
}

function bookingDto(booking: BookingDocument, maskContact: boolean): BookingDto {
  return bookingDtoSchema.parse({
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
      ...(!maskContact && booking.guest.phone !== undefined ? { phone: booking.guest.phone } : {}),
      ...(!maskContact && booking.guest.email !== undefined ? { email: booking.guest.email } : {}),
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
  });
}
