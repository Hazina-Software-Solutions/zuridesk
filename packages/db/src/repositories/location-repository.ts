import type { TrustedTenantContext } from "../context/tenant-context";
import { assertTrustedTenantContext } from "../context/tenant-context";
import { LocationModel, TenantModel } from "../models/identity-models";
import { StaffLocationAssignmentModel } from "../models/phase4-models";
import type { LocationDto, LocationStatus } from "./identity-types";
import { boundedLimit, requiredName, toObjectId } from "./repository-helpers";
import { locationDto } from "./serializers";
import { guardedConfigurationMutation } from "./phase4-guard";

export interface CreateLocationInput {
  id?: string;
  name: string;
  timezone?: string;
  status?: LocationStatus;
}

export interface UpdateLocationInput {
  name?: string;
  timezone?: string;
  status?: LocationStatus;
}

export const locationRepository = {
  async create(context: TrustedTenantContext, input: CreateLocationInput): Promise<LocationDto> {
    assertTrustedTenantContext(context);
    const document = await LocationModel.create({
      schemaVersion: 1,
      ...(input.id === undefined ? {} : { _id: toObjectId(input.id) }),
      tenantId: toObjectId(context.tenantId, "tenantId"),
      name: requiredName(input.name, "name"),
      timezone: input.timezone ?? "Africa/Nairobi",
      status: input.status ?? "active",
      deletedAt: null
    });
    return locationDto(document);
  },

  async findById(context: TrustedTenantContext, id: string): Promise<LocationDto | null> {
    assertTrustedTenantContext(context);
    const document = await LocationModel.findOne({
      _id: toObjectId(id),
      tenantId: toObjectId(context.tenantId, "tenantId"),
      deletedAt: null
    });
    return document === null ? null : locationDto(document);
  },

  async listByStatus(
    context: TrustedTenantContext,
    status: LocationStatus,
    limit?: number
  ): Promise<readonly LocationDto[]> {
    assertTrustedTenantContext(context);
    const documents = await LocationModel.find({
      tenantId: toObjectId(context.tenantId, "tenantId"),
      deletedAt: null,
      status
    })
      .sort({ name: 1, _id: 1 })
      .limit(boundedLimit(limit));
    return documents.map(locationDto);
  },

  async countByStatus(context: TrustedTenantContext, status: LocationStatus): Promise<number> {
    assertTrustedTenantContext(context);
    return LocationModel.countDocuments({
      tenantId: toObjectId(context.tenantId, "tenantId"),
      deletedAt: null,
      status
    });
  },

  async update(
    context: TrustedTenantContext,
    id: string,
    patch: UpdateLocationInput
  ): Promise<LocationDto | null> {
    assertTrustedTenantContext(context);
    const tenantId = toObjectId(context.tenantId, "tenantId");
    const locationId = toObjectId(id);
    const assignments = await StaffLocationAssignmentModel.find({
      tenantId,
      locationId,
      status: "active"
    }).select({ staffProfileId: 1 });
    return guardedConfigurationMutation(
      tenantId,
      [
        { scopeType: "location", scopeId: locationId },
        ...assignments.map(({ staffProfileId }) => ({
          scopeType: "staff" as const,
          scopeId: staffProfileId
        }))
      ],
      async (session) => {
        const document = await LocationModel.findOne({
          _id: locationId,
          tenantId,
          deletedAt: null
        }).session(session);
        if (document === null) return null;

        if (patch.status === "inactive") {
          const tenant = await TenantModel.findOne({ _id: tenantId, deletedAt: null }).session(
            session
          );
          if (tenant === null) return null;
          if (tenant.defaultLocationId.equals(locationId)) {
            throw new Error("The current default location cannot be made inactive");
          }

          // Default reassignment also writes this tenant record, so concurrent
          // status changes conflict instead of leaving an inactive default.
          tenant.updatedAt = new Date();
          tenant.markModified("updatedAt");
          await tenant.save({ session, timestamps: false });
        }

        if (patch.name !== undefined) document.name = requiredName(patch.name, "name");
        if (patch.timezone !== undefined) document.timezone = patch.timezone;
        if (patch.status !== undefined) document.status = patch.status;
        await document.save({ session });
        return locationDto(document);
      }
    );
  },

  async archive(context: TrustedTenantContext, id: string): Promise<LocationDto | null> {
    assertTrustedTenantContext(context);
    const tenantId = toObjectId(context.tenantId, "tenantId");
    const locationId = toObjectId(id);
    const assignments = await StaffLocationAssignmentModel.find({
      tenantId,
      locationId,
      status: "active"
    }).select({ staffProfileId: 1 });
    return guardedConfigurationMutation(
      tenantId,
      [
        { scopeType: "location", scopeId: locationId },
        ...assignments.map(({ staffProfileId }) => ({
          scopeType: "staff" as const,
          scopeId: staffProfileId
        }))
      ],
      async (session) => {
        const location = await LocationModel.findOne({
          _id: locationId,
          tenantId,
          deletedAt: null
        }).session(session);
        if (location === null) return null;

        const tenant = await TenantModel.findOne({ _id: tenantId, deletedAt: null }).session(
          session
        );
        if (tenant === null) return null;
        if (tenant.defaultLocationId.equals(locationId)) {
          throw new Error("The current default location cannot be archived");
        }

        // Both archive and default reassignment write the tenant record. This makes
        // MongoDB's transaction conflict detection protect the cross-document invariant.
        tenant.updatedAt = new Date();
        tenant.markModified("updatedAt");
        await tenant.save({ session, timestamps: false });

        location.status = "inactive";
        location.deletedAt = new Date();
        await location.save({ session });
        return locationDto(location);
      }
    );
  },

  async restore(context: TrustedTenantContext, id: string): Promise<LocationDto | null> {
    assertTrustedTenantContext(context);
    const tenantId = toObjectId(context.tenantId, "tenantId");
    const locationId = toObjectId(id);
    const assignments = await StaffLocationAssignmentModel.find({
      tenantId,
      locationId,
      status: "active"
    }).select({ staffProfileId: 1 });
    return guardedConfigurationMutation(
      tenantId,
      [
        { scopeType: "location", scopeId: locationId },
        ...assignments.map(({ staffProfileId }) => ({
          scopeType: "staff" as const,
          scopeId: staffProfileId
        }))
      ],
      async (session) => {
        const document = await LocationModel.findOne({
          _id: locationId,
          tenantId,
          status: "inactive",
          deletedAt: { $ne: null }
        }).session(session);
        if (document === null) return null;
        document.status = "active";
        document.deletedAt = null;
        await document.save({ session });
        return locationDto(document);
      }
    );
  }
};
