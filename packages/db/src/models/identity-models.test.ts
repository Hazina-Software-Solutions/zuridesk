import { describe, expect, it } from "vitest";

import { InviteModel, LocationModel, MembershipModel, TenantModel } from "./identity-models";

const tenantId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";

describe("tenant identity schemas", () => {
  it("uses strict versioned schemas and keeps invite digests unselected", () => {
    expect(TenantModel.schema.get("strict")).toBe("throw");
    expect(TenantModel.schema.path("schemaVersion").options).toMatchObject({
      immutable: true
    });
    expect(InviteModel.schema.path("tokenDigest").options.select).toBe(false);
  });

  it("rejects lifecycle fields that disagree with location status", async () => {
    const location = new LocationModel({
      schemaVersion: 1,
      tenantId,
      name: "Archived but active",
      status: "active",
      deletedAt: new Date()
    });
    await expect(location.validate()).rejects.toThrow("Archived locations must be inactive");
  });

  it("requires nonempty deduplicated membership roles and matching revocation fields", async () => {
    const duplicateRoles = new MembershipModel({
      schemaVersion: 1,
      tenantId,
      userId,
      roleKeys: ["owner", "owner"],
      status: "active",
      revokedAt: null,
      deletedAt: null
    });
    await expect(duplicateRoles.validate()).rejects.toThrow("deduplicated");

    const incompleteRevocation = new MembershipModel({
      schemaVersion: 1,
      tenantId,
      userId,
      roleKeys: ["owner"],
      status: "revoked",
      revokedAt: new Date(),
      deletedAt: null
    });
    await expect(incompleteRevocation.validate()).rejects.toThrow("matching revokedAt");
  });

  it("requires invite status and recipient lifecycle data to agree", async () => {
    const invite = new InviteModel({
      schemaVersion: 1,
      tenantId,
      recipient: { kind: "email", value: "UPPER@example.com" },
      roleKeys: ["stylist"],
      tokenDigest: "a".repeat(64),
      status: "accepted",
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      revokedAt: null
    });
    await expect(invite.validate()).rejects.toThrow("lifecycle timestamps");
  });
});
