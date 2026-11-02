import type { TrustedTenantContext } from "../context/tenant-context";
import { assertTrustedTenantContext } from "../context/tenant-context";
import { getInternalDatabaseConnection } from "../connection";
import { Types } from "mongoose";
import { LocationModel, MembershipModel, TenantModel, UserModel } from "../models/identity-models";
import type { LocationDto, MembershipDto, TenantDto } from "./identity-types";
import { requiredName, roleKeys, toObjectId } from "./repository-helpers";
import { locationDto, membershipDto, tenantDto } from "./serializers";

export interface BootstrapTenantIdentityInput {
  tenantId?: string;
  locationId?: string;
  membershipId?: string;
  userId: string;
  tenantName: string;
  locationName: string;
  timezone?: string;
}

export interface BootstrapTenantIdentityResult {
  readonly tenant: TenantDto;
  readonly location: LocationDto;
  readonly ownerMembership: MembershipDto;
}

export async function bootstrapTenantIdentity(
  input: BootstrapTenantIdentityInput
): Promise<BootstrapTenantIdentityResult> {
  const tenantId = toObjectId(input.tenantId ?? new Types.ObjectId().toHexString());
  const locationId = toObjectId(input.locationId ?? new Types.ObjectId().toHexString());
  const membershipId = toObjectId(input.membershipId ?? new Types.ObjectId().toHexString());
  const userId = toObjectId(input.userId, "userId");

  return getInternalDatabaseConnection().transaction(async (session) => {
    const userExists = await UserModel.exists({
      _id: userId,
      status: "active",
      deletedAt: null
    }).session(session);
    if (userExists === null) throw new Error("Owner user must exist and be active");

    const [tenant] = await TenantModel.create(
      [
        {
          _id: tenantId,
          schemaVersion: 1,
          name: requiredName(input.tenantName, "tenantName"),
          defaultLocationId: locationId,
          status: "active",
          deletedAt: null
        }
      ],
      { session }
    );
    const [location] = await LocationModel.create(
      [
        {
          _id: locationId,
          schemaVersion: 1,
          tenantId,
          name: requiredName(input.locationName, "locationName"),
          timezone: input.timezone ?? "Africa/Nairobi",
          status: "active",
          deletedAt: null
        }
      ],
      { session }
    );
    const [membership] = await MembershipModel.create(
      [
        {
          _id: membershipId,
          schemaVersion: 1,
          tenantId,
          userId,
          roleKeys: roleKeys(["owner"]),
          status: "active",
          revokedAt: null,
          deletedAt: null
        }
      ],
      { session }
    );

    if (tenant === undefined || location === undefined || membership === undefined) {
      throw new Error("Tenant bootstrap did not create every required record");
    }
    return {
      tenant: tenantDto(tenant),
      location: locationDto(location),
      ownerMembership: membershipDto(membership)
    };
  });
}

export const currentTenantRepository = {
  async get(context: TrustedTenantContext): Promise<TenantDto | null> {
    assertTrustedTenantContext(context);
    const document = await TenantModel.findOne({
      _id: toObjectId(context.tenantId, "tenantId"),
      deletedAt: null
    });
    return document === null ? null : tenantDto(document);
  },

  async setDefaultLocation(
    context: TrustedTenantContext,
    locationIdValue: string
  ): Promise<TenantDto | null> {
    assertTrustedTenantContext(context);
    const tenantId = toObjectId(context.tenantId, "tenantId");
    const locationId = toObjectId(locationIdValue, "locationId");

    return getInternalDatabaseConnection().transaction(async (session) => {
      const location = await LocationModel.findOne({
        _id: locationId,
        tenantId,
        status: "active",
        deletedAt: null
      }).session(session);
      if (location === null)
        throw new Error("Default location must be active in the current tenant");

      const tenant = await TenantModel.findOne({ _id: tenantId, deletedAt: null }).session(session);
      if (tenant === null) return null;
      tenant.defaultLocationId = locationId;
      await tenant.save({ session });
      return tenantDto(tenant);
    });
  }
};
