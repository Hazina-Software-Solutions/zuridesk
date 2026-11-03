import type {
  InviteDocument,
  LocationDocument,
  MembershipDocument,
  TenantDocument,
  UserDocument
} from "../models/identity-models";
import type { InviteDto, LocationDto, MembershipDto, TenantDto, UserDto } from "./identity-types";
import { cloneDate, cloneNullableDate, toObjectIdString } from "./repository-helpers";

export function tenantDto(document: TenantDocument): TenantDto {
  return {
    id: toObjectIdString(document._id),
    schemaVersion: document.schemaVersion,
    name: document.name,
    defaultLocationId: toObjectIdString(document.defaultLocationId),
    status: document.status,
    deletedAt: cloneNullableDate(document.deletedAt),
    createdAt: cloneDate(document.createdAt),
    updatedAt: cloneDate(document.updatedAt)
  };
}

export function locationDto(document: LocationDocument): LocationDto {
  return {
    id: toObjectIdString(document._id),
    schemaVersion: 1,
    tenantId: toObjectIdString(document.tenantId),
    name: document.name,
    timezone: document.timezone,
    status: document.status,
    deletedAt: cloneNullableDate(document.deletedAt),
    createdAt: cloneDate(document.createdAt),
    updatedAt: cloneDate(document.updatedAt)
  };
}

export function userDto(document: UserDocument): UserDto {
  return {
    id: toObjectIdString(document._id),
    schemaVersion: 1,
    displayName: document.displayName,
    ...(document.normalizedEmail === undefined
      ? {}
      : { normalizedEmail: document.normalizedEmail }),
    ...(document.phone === undefined ? {} : { phone: document.phone }),
    status: document.status,
    deletedAt: cloneNullableDate(document.deletedAt),
    createdAt: cloneDate(document.createdAt),
    updatedAt: cloneDate(document.updatedAt)
  };
}

export function membershipDto(document: MembershipDocument): MembershipDto {
  return {
    id: toObjectIdString(document._id),
    schemaVersion: 1,
    tenantId: toObjectIdString(document.tenantId),
    userId: toObjectIdString(document.userId),
    roleKeys: [...document.roleKeys],
    status: document.status,
    joinedAt: cloneDate(document.joinedAt),
    revokedAt: cloneNullableDate(document.revokedAt),
    deletedAt: cloneNullableDate(document.deletedAt),
    createdAt: cloneDate(document.createdAt),
    updatedAt: cloneDate(document.updatedAt)
  };
}

export function inviteDto(document: InviteDocument): InviteDto {
  return {
    id: toObjectIdString(document._id),
    schemaVersion: document.schemaVersion,
    tenantId: toObjectIdString(document.tenantId),
    recipient: { kind: document.recipient.kind, value: document.recipient.value },
    roleKeys: [...document.roleKeys],
    status: document.status,
    expiresAt: cloneDate(document.expiresAt),
    acceptedAt: cloneNullableDate(document.acceptedAt),
    acceptedByUserId:
      document.acceptedByUserId == null ? null : toObjectIdString(document.acceptedByUserId),
    revokedAt: cloneNullableDate(document.revokedAt),
    createdAt: cloneDate(document.createdAt),
    updatedAt: cloneDate(document.updatedAt)
  };
}
