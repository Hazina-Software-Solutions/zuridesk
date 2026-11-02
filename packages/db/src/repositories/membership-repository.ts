import type { TrustedTenantContext } from "../context/tenant-context";
import {
  assertTrustedTenantContext,
  createInternalTrustedTenantContext
} from "../context/tenant-context";
import {
  MembershipModel,
  TenantModel,
  UserModel,
  type MembershipDocument,
  type UserDocument
} from "../models/identity-models";
import type {
  MembershipDto,
  MembershipStatus,
  MembershipWithUserDto,
  RoleKey
} from "./identity-types";
import { boundedLimit, roleKeys, toObjectId } from "./repository-helpers";
import { membershipDto, userDto } from "./serializers";

export interface CreateMembershipInput {
  id?: string;
  userId: string;
  roleKeys: readonly RoleKey[];
  status?: Exclude<MembershipStatus, "revoked">;
}

export interface VerifyCandidateTenantInput {
  tenantId: string;
  authenticatedUserId: string;
  requestId: string;
}

interface MembershipWithUserAggregationRow extends MembershipDocument {
  user?: UserDocument;
}

export async function verifyCandidateTenantMembership(
  input: VerifyCandidateTenantInput
): Promise<TrustedTenantContext | null> {
  const tenantId = toObjectId(input.tenantId, "tenantId");
  const userId = toObjectId(input.authenticatedUserId, "authenticatedUserId");
  const [membership, tenant, user] = await Promise.all([
    MembershipModel.exists({ tenantId, userId, status: "active", deletedAt: null }),
    TenantModel.exists({ _id: tenantId, status: "active", deletedAt: null }),
    UserModel.exists({ _id: userId, status: "active", deletedAt: null })
  ]);
  if (membership === null || tenant === null || user === null) return null;

  return createInternalTrustedTenantContext({
    tenantId: input.tenantId,
    userId: input.authenticatedUserId,
    requestId: input.requestId
  });
}

export const membershipRepository = {
  async create(
    context: TrustedTenantContext,
    input: CreateMembershipInput
  ): Promise<MembershipDto> {
    assertTrustedTenantContext(context);
    const userId = toObjectId(input.userId, "userId");
    const userExists = await UserModel.exists({ _id: userId, deletedAt: null });
    if (userExists === null) throw new Error("Membership user must exist");

    const document = await MembershipModel.create({
      schemaVersion: 1,
      ...(input.id === undefined ? {} : { _id: toObjectId(input.id) }),
      tenantId: toObjectId(context.tenantId, "tenantId"),
      userId,
      roleKeys: roleKeys(input.roleKeys),
      status: input.status ?? "active",
      revokedAt: null,
      deletedAt: null
    });
    return membershipDto(document);
  },

  async findByUser(context: TrustedTenantContext, userId: string): Promise<MembershipDto | null> {
    assertTrustedTenantContext(context);
    const document = await MembershipModel.findOne({
      tenantId: toObjectId(context.tenantId, "tenantId"),
      userId: toObjectId(userId, "userId"),
      deletedAt: null
    });
    return document === null ? null : membershipDto(document);
  },

  async listByStatus(
    context: TrustedTenantContext,
    status: Exclude<MembershipStatus, "revoked">,
    limit?: number
  ): Promise<readonly MembershipDto[]> {
    assertTrustedTenantContext(context);
    const documents = await MembershipModel.find({
      tenantId: toObjectId(context.tenantId, "tenantId"),
      deletedAt: null,
      status
    })
      .sort({ createdAt: -1, _id: 1 })
      .limit(boundedLimit(limit));
    return documents.map(membershipDto);
  },

  async listWithUsersByStatus(
    context: TrustedTenantContext,
    status: Exclude<MembershipStatus, "revoked">,
    limit?: number
  ): Promise<readonly MembershipWithUserDto[]> {
    assertTrustedTenantContext(context);
    const tenantId = toObjectId(context.tenantId, "tenantId");
    const rows = await MembershipModel.aggregate<MembershipWithUserAggregationRow>([
      { $match: { tenantId, deletedAt: null, status } },
      { $sort: { createdAt: -1, _id: 1 } },
      { $limit: boundedLimit(limit) },
      {
        $lookup: {
          from: "users",
          let: { joinedUserId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$joinedUserId"] },
                deletedAt: null
              }
            }
          ],
          as: "joinedUser"
        }
      },
      { $set: { user: { $first: "$joinedUser" } } },
      { $unset: "joinedUser" }
    ]);

    return rows.map((row) => ({
      membership: membershipDto(row),
      user: row.user === undefined ? null : userDto(row.user)
    }));
  },

  async countByStatus(
    context: TrustedTenantContext,
    status: Exclude<MembershipStatus, "revoked">
  ): Promise<number> {
    assertTrustedTenantContext(context);
    return MembershipModel.countDocuments({
      tenantId: toObjectId(context.tenantId, "tenantId"),
      deletedAt: null,
      status
    });
  },

  async updateRoles(
    context: TrustedTenantContext,
    id: string,
    roles: readonly RoleKey[]
  ): Promise<MembershipDto | null> {
    assertTrustedTenantContext(context);
    const document = await MembershipModel.findOne({
      _id: toObjectId(id),
      tenantId: toObjectId(context.tenantId, "tenantId"),
      deletedAt: null
    });
    if (document === null) return null;
    document.roleKeys = roleKeys(roles);
    await document.save();
    return membershipDto(document);
  },

  async updateStatus(
    context: TrustedTenantContext,
    id: string,
    status: Exclude<MembershipStatus, "revoked">
  ): Promise<MembershipDto | null> {
    assertTrustedTenantContext(context);
    const document = await MembershipModel.findOne({
      _id: toObjectId(id),
      tenantId: toObjectId(context.tenantId, "tenantId"),
      deletedAt: null
    });
    if (document === null) return null;
    document.status = status;
    await document.save();
    return membershipDto(document);
  },

  async revoke(context: TrustedTenantContext, id: string): Promise<MembershipDto | null> {
    assertTrustedTenantContext(context);
    const document = await MembershipModel.findOne({
      _id: toObjectId(id),
      tenantId: toObjectId(context.tenantId, "tenantId"),
      deletedAt: null
    });
    if (document === null) return null;
    const revokedAt = new Date();
    document.status = "revoked";
    document.revokedAt = revokedAt;
    document.deletedAt = revokedAt;
    await document.save();
    return membershipDto(document);
  },

  async restore(context: TrustedTenantContext, id: string): Promise<MembershipDto | null> {
    assertTrustedTenantContext(context);
    const document = await MembershipModel.findOne({
      _id: toObjectId(id),
      tenantId: toObjectId(context.tenantId, "tenantId"),
      status: "revoked",
      deletedAt: { $ne: null }
    });
    if (document === null) return null;
    document.status = "active";
    document.revokedAt = null;
    document.deletedAt = null;
    await document.save();
    return membershipDto(document);
  }
};
