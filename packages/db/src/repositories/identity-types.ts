import type { ObjectIdString } from "@zuridesk/shared";

import type {
  InviteStatus,
  LocationStatus,
  MembershipStatus,
  RoleKey,
  TenantStatus,
  UserStatus
} from "../models/identity-models";

interface TimestampedDto {
  readonly id: ObjectIdString;
  readonly schemaVersion: 1;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TenantDto extends TimestampedDto {
  readonly name: string;
  readonly defaultLocationId: ObjectIdString;
  readonly status: TenantStatus;
  readonly deletedAt: Date | null;
}

export interface LocationDto extends TimestampedDto {
  readonly tenantId: ObjectIdString;
  readonly name: string;
  readonly timezone: string;
  readonly status: LocationStatus;
  readonly deletedAt: Date | null;
}

export interface UserDto extends TimestampedDto {
  readonly displayName: string;
  readonly normalizedEmail?: string;
  readonly phone?: string;
  readonly status: UserStatus;
  readonly deletedAt: Date | null;
}

export interface MembershipDto extends TimestampedDto {
  readonly tenantId: ObjectIdString;
  readonly userId: ObjectIdString;
  readonly roleKeys: readonly RoleKey[];
  readonly status: MembershipStatus;
  readonly joinedAt: Date;
  readonly revokedAt: Date | null;
  readonly deletedAt: Date | null;
}

export interface MembershipWithUserDto {
  readonly membership: MembershipDto;
  readonly user: UserDto | null;
}

export interface InviteRecipientDto {
  readonly kind: "email" | "phone";
  readonly value: string;
}

export interface InviteDto extends TimestampedDto {
  readonly tenantId: ObjectIdString;
  readonly recipient: InviteRecipientDto;
  readonly roleKeys: readonly RoleKey[];
  readonly status: InviteStatus;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
}

export type { InviteStatus, LocationStatus, MembershipStatus, RoleKey, TenantStatus, UserStatus };
