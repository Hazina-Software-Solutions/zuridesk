import type { TrustedTenantContext } from "../context/tenant-context";
import { assertTrustedTenantContext } from "../context/tenant-context";
import { InviteModel } from "../models/identity-models";
import type { InviteDto, InviteStatus, RoleKey } from "./identity-types";
import { boundedLimit, normalizeRecipient, roleKeys, toObjectId } from "./repository-helpers";
import { inviteDto } from "./serializers";

export interface CreateInviteInput {
  id?: string;
  recipient: { kind: "email" | "phone"; value: string };
  roleKeys: readonly RoleKey[];
  tokenDigest: string;
  expiresAt: Date;
}

function assertDigest(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("tokenDigest must be a lowercase SHA-256 digest");
  }
  return value;
}

export const inviteRepository = {
  async create(context: TrustedTenantContext, input: CreateInviteInput): Promise<InviteDto> {
    assertTrustedTenantContext(context);
    if (!(input.expiresAt instanceof Date) || !Number.isFinite(input.expiresAt.getTime())) {
      throw new Error("expiresAt must be a valid Date");
    }
    if (input.expiresAt.getTime() <= Date.now()) {
      throw new Error("expiresAt must be in the future");
    }

    const document = await InviteModel.create({
      schemaVersion: 1,
      ...(input.id === undefined ? {} : { _id: toObjectId(input.id) }),
      tenantId: toObjectId(context.tenantId, "tenantId"),
      recipient: normalizeRecipient(input.recipient),
      roleKeys: roleKeys(input.roleKeys),
      tokenDigest: assertDigest(input.tokenDigest),
      status: "pending",
      expiresAt: new Date(input.expiresAt.getTime()),
      acceptedAt: null,
      revokedAt: null
    });
    return inviteDto(document);
  },

  async findById(context: TrustedTenantContext, id: string): Promise<InviteDto | null> {
    assertTrustedTenantContext(context);
    const document = await InviteModel.findOne({
      _id: toObjectId(id),
      tenantId: toObjectId(context.tenantId, "tenantId"),
      expiresAt: { $gt: new Date() }
    });
    return document === null ? null : inviteDto(document);
  },

  async findPendingByRecipient(
    context: TrustedTenantContext,
    recipientInput: { kind: "email" | "phone"; value: string }
  ): Promise<InviteDto | null> {
    assertTrustedTenantContext(context);
    const recipient = normalizeRecipient(recipientInput);
    const document = await InviteModel.findOne({
      tenantId: toObjectId(context.tenantId, "tenantId"),
      "recipient.kind": recipient.kind,
      "recipient.value": recipient.value,
      status: "pending",
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1, _id: 1 });
    return document === null ? null : inviteDto(document);
  },

  async listByStatus(
    context: TrustedTenantContext,
    status: InviteStatus,
    limit?: number
  ): Promise<readonly InviteDto[]> {
    assertTrustedTenantContext(context);
    const documents = await InviteModel.find({
      tenantId: toObjectId(context.tenantId, "tenantId"),
      status,
      expiresAt: { $gt: new Date() }
    })
      .sort({ createdAt: -1, _id: 1 })
      .limit(boundedLimit(limit));
    return documents.map(inviteDto);
  },

  async listPending(context: TrustedTenantContext, limit?: number): Promise<readonly InviteDto[]> {
    return this.listByStatus(context, "pending", limit);
  },

  async countByStatus(context: TrustedTenantContext, status: InviteStatus): Promise<number> {
    assertTrustedTenantContext(context);
    return InviteModel.countDocuments({
      tenantId: toObjectId(context.tenantId, "tenantId"),
      status,
      expiresAt: { $gt: new Date() }
    });
  },

  async revoke(context: TrustedTenantContext, id: string): Promise<InviteDto | null> {
    assertTrustedTenantContext(context);
    const document = await InviteModel.findOne({
      _id: toObjectId(id),
      tenantId: toObjectId(context.tenantId, "tenantId"),
      status: "pending",
      expiresAt: { $gt: new Date() }
    });
    if (document === null) return null;
    document.status = "revoked";
    document.revokedAt = new Date();
    await document.save();
    return inviteDto(document);
  }
};
