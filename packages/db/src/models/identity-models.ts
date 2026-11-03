import mongoose, { Schema, type HydratedDocument, type Model, type Types } from "mongoose";

export const ROLE_KEYS = ["owner", "manager", "receptionist", "stylist"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];
export type TenantStatus = "active" | "suspended";
export type LocationStatus = "active" | "inactive";
export type UserStatus = "active" | "disabled";
export type MembershipStatus = "active" | "suspended" | "revoked";
export type InviteStatus = "pending" | "accepted" | "revoked";

interface TimestampedDocument {
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantDocument extends TimestampedDocument {
  _id: Types.ObjectId;
  schemaVersion: 1;
  name: string;
  defaultLocationId: Types.ObjectId;
  status: TenantStatus;
  deletedAt: Date | null;
  ownerGuardVersion: number;
}

export interface LocationDocument extends TimestampedDocument {
  _id: Types.ObjectId;
  schemaVersion: 1;
  tenantId: Types.ObjectId;
  name: string;
  timezone: string;
  status: LocationStatus;
  deletedAt: Date | null;
}

export interface UserDocument extends TimestampedDocument {
  _id: Types.ObjectId;
  schemaVersion: 1;
  displayName: string;
  normalizedEmail?: string;
  phone?: string;
  status: UserStatus;
  deletedAt: Date | null;
}

export interface MembershipDocument extends TimestampedDocument {
  _id: Types.ObjectId;
  schemaVersion: 1;
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  roleKeys: RoleKey[];
  status: MembershipStatus;
  joinedAt: Date;
  revokedAt: Date | null;
  deletedAt: Date | null;
}

export interface InviteRecipientDocument {
  kind: "email" | "phone";
  value: string;
}

export interface InviteDocument extends TimestampedDocument {
  _id: Types.ObjectId;
  schemaVersion: 1 | 2;
  tenantId: Types.ObjectId;
  recipient: InviteRecipientDocument;
  roleKeys: RoleKey[];
  tokenDigest: string;
  status: InviteStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedByUserId: Types.ObjectId | null;
  revokedAt: Date | null;
}

const schemaOptions = {
  strict: "throw" as const,
  timestamps: true as const,
  versionKey: false as const
};

const schemaVersion = {
  type: Number,
  required: true,
  immutable: true,
  enum: [1]
} as const;

const deletedAt = { type: Date, default: null } as const;
const requiredObjectId = { type: Schema.Types.ObjectId, required: true } as const;
const requiredImmutableObjectId = {
  type: Schema.Types.ObjectId,
  required: true,
  immutable: true
} as const;

function assertRoles(roleKeys: readonly RoleKey[]): boolean {
  return roleKeys.length > 0 && new Set(roleKeys).size === roleKeys.length;
}

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const tenantSchema = new Schema<TenantDocument>(
  {
    schemaVersion,
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    defaultLocationId: requiredObjectId,
    status: { type: String, required: true, enum: ["active", "suspended"], default: "active" },
    deletedAt,
    ownerGuardVersion: { type: Number, required: true, default: 0, min: 0 }
  },
  { ...schemaOptions, collection: "tenants" }
);

tenantSchema.pre("validate", function (this: HydratedDocument<TenantDocument>) {
  if (this.deletedAt !== null && this.status !== "suspended") {
    throw new Error("A deleted tenant must be suspended");
  }
});

export const locationSchema = new Schema<LocationDocument>(
  {
    schemaVersion,
    tenantId: requiredImmutableObjectId,
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    timezone: {
      type: String,
      required: true,
      default: "Africa/Nairobi",
      validate: { validator: isIanaTimezone, message: "timezone must be a valid IANA timezone" }
    },
    status: { type: String, required: true, enum: ["active", "inactive"], default: "active" },
    deletedAt
  },
  { ...schemaOptions, collection: "locations" }
);

locationSchema.pre("validate", function (this: HydratedDocument<LocationDocument>) {
  if (this.deletedAt !== null && this.status !== "inactive") {
    throw new Error("Archived locations must be inactive");
  }
});

export const userSchema = new Schema<UserDocument>(
  {
    schemaVersion,
    displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    normalizedEmail: {
      type: String,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    phone: { type: String, match: /^\+[1-9]\d{7,14}$/ },
    status: { type: String, required: true, enum: ["active", "disabled"], default: "active" },
    deletedAt
  },
  { ...schemaOptions, collection: "users" }
);

userSchema.pre("validate", function (this: HydratedDocument<UserDocument>) {
  if (this.deletedAt !== null && this.status !== "disabled") {
    throw new Error("A deleted user must be disabled");
  }
});

export const membershipSchema = new Schema<MembershipDocument>(
  {
    schemaVersion,
    tenantId: requiredImmutableObjectId,
    userId: requiredImmutableObjectId,
    roleKeys: {
      type: [{ type: String, enum: ROLE_KEYS }],
      required: true,
      validate: { validator: assertRoles, message: "roleKeys must be nonempty and deduplicated" }
    },
    status: {
      type: String,
      required: true,
      enum: ["active", "suspended", "revoked"],
      default: "active"
    },
    joinedAt: { type: Date, required: true, default: Date.now, immutable: true },
    revokedAt: deletedAt,
    deletedAt
  },
  { ...schemaOptions, collection: "memberships" }
);

membershipSchema.pre("validate", function (this: HydratedDocument<MembershipDocument>) {
  const revoked = this.status === "revoked";
  if (revoked !== (this.revokedAt !== null) || revoked !== (this.deletedAt !== null)) {
    throw new Error(
      "Revoked memberships require matching revokedAt and deletedAt lifecycle fields"
    );
  }
});

const recipientSchema = new Schema<InviteRecipientDocument>(
  {
    kind: { type: String, required: true, enum: ["email", "phone"] },
    value: { type: String, required: true, trim: true }
  },
  { _id: false, strict: "throw" }
);

export const inviteSchema = new Schema<InviteDocument>(
  {
    schemaVersion: { ...schemaVersion, enum: [1, 2] },
    tenantId: requiredImmutableObjectId,
    recipient: { type: recipientSchema, required: true },
    roleKeys: {
      type: [{ type: String, enum: ROLE_KEYS }],
      required: true,
      validate: { validator: assertRoles, message: "roleKeys must be nonempty and deduplicated" }
    },
    tokenDigest: {
      type: String,
      required: true,
      immutable: true,
      select: false,
      match: /^[0-9a-f]{64}$/
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "accepted", "revoked"],
      default: "pending"
    },
    expiresAt: { type: Date, required: true, immutable: true },
    acceptedAt: deletedAt,
    acceptedByUserId: { type: Schema.Types.ObjectId, default: null },
    revokedAt: deletedAt
  },
  { ...schemaOptions, collection: "invites" }
);

inviteSchema.pre("validate", function (this: HydratedDocument<InviteDocument>) {
  const hasAcceptedAt = this.acceptedAt !== null;
  const hasRevokedAt = this.revokedAt !== null;
  const hasAcceptedUser = this.acceptedByUserId != null;
  const lifecycleIsValid =
    (this.status === "pending" && !hasAcceptedAt && !hasRevokedAt && !hasAcceptedUser) ||
    (this.status === "accepted" &&
      hasAcceptedAt &&
      !hasRevokedAt &&
      (this.schemaVersion === 1 || hasAcceptedUser)) ||
    (this.status === "revoked" && !hasAcceptedAt && hasRevokedAt && !hasAcceptedUser);

  if (!lifecycleIsValid) {
    throw new Error("Invite status and lifecycle timestamps do not match");
  }
  if (this.recipient.kind === "email") {
    if (
      this.recipient.value !== this.recipient.value.toLowerCase() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.recipient.value)
    ) {
      throw new Error("Email invite recipients must be normalized");
    }
  } else if (!/^\+[1-9]\d{7,14}$/.test(this.recipient.value)) {
    throw new Error("Phone invite recipients must use E.164 format");
  }
});

export const TenantModel =
  (mongoose.models.Tenant as Model<TenantDocument> | undefined) ??
  mongoose.model<TenantDocument>("Tenant", tenantSchema);
export const LocationModel =
  (mongoose.models.Location as Model<LocationDocument> | undefined) ??
  mongoose.model<LocationDocument>("Location", locationSchema);
export const UserModel =
  (mongoose.models.User as Model<UserDocument> | undefined) ??
  mongoose.model<UserDocument>("User", userSchema);
export const MembershipModel =
  (mongoose.models.Membership as Model<MembershipDocument> | undefined) ??
  mongoose.model<MembershipDocument>("Membership", membershipSchema);
export const InviteModel =
  (mongoose.models.Invite as Model<InviteDocument> | undefined) ??
  mongoose.model<InviteDocument>("Invite", inviteSchema);
